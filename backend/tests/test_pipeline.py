import pytest

from indexer.pipeline import run_indexing
from indexer.tarball import ExtractedFile
from indexer.types import Chunk


class FakeFetcher:
    def __init__(self, files: list[ExtractedFile]):
        self._files = files
        self.called = False

    async def __call__(self, owner: str, repo: str) -> list[ExtractedFile]:
        self.called = True
        return self._files


class FakeEmbedder:
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [[float(len(t)), 0.0] for t in texts]


class FakeStore:
    def __init__(self):
        self.upserts: list[tuple[str, str, list[Chunk], list[list[float]]]] = []

    def upsert(self, owner, repo, chunks, embeddings):
        self.upserts.append((owner, repo, chunks, embeddings))


@pytest.mark.asyncio
async def test_pipeline_emits_phases_and_stores():
    fetcher = FakeFetcher([
        ExtractedFile(path="a.py", content="def foo():\n    return 1\n"),
    ])
    store = FakeStore()
    events = []
    async for ev in run_indexing(
        owner="o", repo="r",
        fetcher=fetcher, embedder=FakeEmbedder(), store=store,
    ):
        events.append(ev)

    phases = [e.phase for e in events]
    assert phases[0] == "downloading"
    assert "chunking" in phases
    assert "embedding" in phases
    assert phases[-1] == "ready"
    assert len(store.upserts) == 1
    assert store.upserts[0][0] == "o"


@pytest.mark.asyncio
async def test_pipeline_emits_too_large_when_fetcher_raises():
    from indexer.tarball import FileTooLargeError

    class BadFetcher:
        async def __call__(self, owner, repo):
            raise FileTooLargeError(count=5000, limit=1500)

    events = []
    async for ev in run_indexing(
        owner="o", repo="r",
        fetcher=BadFetcher(), embedder=FakeEmbedder(), store=FakeStore(),
    ):
        events.append(ev)

    assert events[-1].phase == "too_large"
    assert events[-1].current == 5000
    assert events[-1].total == 1500
