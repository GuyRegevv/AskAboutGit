from typing import AsyncIterator, Awaitable, Callable, Protocol

from indexer.chunker import chunk_files
from indexer.tarball import ExtractedFile, FileTooLargeError
from indexer.types import Chunk, ProgressEvent


class _StoreLike(Protocol):
    def upsert(
        self, owner: str, repo: str,
        chunks: list[Chunk], embeddings: list[list[float]],
    ) -> None: ...


class _EmbedderLike(Protocol):
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


Fetcher = Callable[[str, str], Awaitable[list[ExtractedFile]]]


EMBED_BATCH_FOR_PROGRESS = 50


async def run_indexing(
    owner: str,
    repo: str,
    fetcher: Fetcher,
    embedder: _EmbedderLike,
    store: _StoreLike,
) -> AsyncIterator[ProgressEvent]:
    yield ProgressEvent(phase="downloading")

    try:
        files = await fetcher(owner, repo)
    except FileTooLargeError as e:
        yield ProgressEvent(phase="too_large", current=e.count, total=e.limit)
        return
    except Exception as e:
        yield ProgressEvent(phase="failed", message=str(e)[:200])
        return

    yield ProgressEvent(phase="extracting")
    yield ProgressEvent(phase="selecting", total=len(files))

    yield ProgressEvent(phase="chunking", total=len(files))
    chunks = chunk_files(files)
    if not chunks:
        yield ProgressEvent(phase="failed", message="No chunks produced from repo")
        return

    embeddings: list[list[float]] = []
    total = len(chunks)
    for i in range(0, total, EMBED_BATCH_FOR_PROGRESS):
        batch_texts = [c.text for c in chunks[i : i + EMBED_BATCH_FOR_PROGRESS]]
        batch_emb = await embedder.embed_batch(batch_texts)
        embeddings.extend(batch_emb)
        yield ProgressEvent(
            phase="embedding",
            current=min(i + EMBED_BATCH_FOR_PROGRESS, total),
            total=total,
        )

    yield ProgressEvent(phase="storing")
    store.upsert(owner, repo, chunks, embeddings)
    yield ProgressEvent(phase="ready", total=len(chunks))
