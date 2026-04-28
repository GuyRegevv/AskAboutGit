import time
import uuid
from typing import Optional

import chromadb

from indexer.types import Chunk


def _collection_name(owner: str, repo: str) -> str:
    safe = lambda s: s.replace("/", "_").replace(".", "_").lower()
    return f"{safe(owner)}__{safe(repo)}"


class ChromaStore:
    def __init__(self, persist_dir: str):
        self._client = chromadb.PersistentClient(path=persist_dir)

    def upsert(
        self,
        owner: str,
        repo: str,
        chunks: list[Chunk],
        embeddings: list[list[float]],
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("chunks and embeddings length mismatch")
        name = _collection_name(owner, repo)
        try:
            self._client.delete_collection(name)
        except Exception:
            pass
        coll = self._client.create_collection(
            name=name, metadata={"indexed_at": time.time()}
        )
        if not chunks:
            return
        coll.add(
            ids=[str(uuid.uuid4()) for _ in chunks],
            embeddings=embeddings,
            documents=[c.text for c in chunks],
            metadatas=[
                {
                    "file_path": c.file_path,
                    "start_line": c.start_line,
                    "end_line": c.end_line,
                    "language": c.language,
                }
                for c in chunks
            ],
        )

    def query(
        self,
        owner: str,
        repo: str,
        query_embedding: list[float],
        k: int = 8,
    ) -> list[Chunk]:
        name = _collection_name(owner, repo)
        coll = self._client.get_collection(name)
        res = coll.query(query_embeddings=[query_embedding], n_results=k)
        out: list[Chunk] = []
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        for text, meta in zip(docs, metas):
            out.append(
                Chunk(
                    text=text,
                    file_path=meta["file_path"],
                    start_line=int(meta["start_line"]),
                    end_line=int(meta["end_line"]),
                    language=meta["language"],
                )
            )
        return out

    def collection_age_seconds(self, owner: str, repo: str) -> Optional[float]:
        name = _collection_name(owner, repo)
        try:
            coll = self._client.get_collection(name)
        except Exception:
            return None
        indexed_at = (coll.metadata or {}).get("indexed_at")
        if not indexed_at:
            return None
        return time.time() - float(indexed_at)

    def delete(self, owner: str, repo: str) -> None:
        try:
            self._client.delete_collection(_collection_name(owner, repo))
        except Exception:
            pass
