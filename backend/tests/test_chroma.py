import time

from indexer.types import Chunk
from vectorstore.chroma import ChromaStore


def test_upsert_and_query_round_trip(tmp_path):
    store = ChromaStore(persist_dir=str(tmp_path))
    chunks = [
        Chunk(text="auth login flow", file_path="auth.py", start_line=1, end_line=5, language="python"),
        Chunk(text="database migration utility", file_path="db.py", start_line=1, end_line=5, language="python"),
    ]
    embeddings = [[1.0, 0.0], [0.0, 1.0]]

    store.upsert("alice", "demo", chunks, embeddings)

    results = store.query("alice", "demo", query_embedding=[0.99, 0.01], k=1)
    assert len(results) == 1
    assert results[0].file_path == "auth.py"


def test_collection_exists_and_age(tmp_path):
    store = ChromaStore(persist_dir=str(tmp_path))
    assert store.collection_age_seconds("a", "b") is None

    store.upsert(
        "a", "b",
        [Chunk(text="x", file_path="x.py", start_line=1, end_line=1, language="python")],
        [[1.0, 0.0]],
    )
    age = store.collection_age_seconds("a", "b")
    assert age is not None and age >= 0


def test_delete_collection(tmp_path):
    store = ChromaStore(persist_dir=str(tmp_path))
    store.upsert(
        "a", "b",
        [Chunk(text="x", file_path="x.py", start_line=1, end_line=1, language="python")],
        [[1.0, 0.0]],
    )
    store.delete("a", "b")
    assert store.collection_age_seconds("a", "b") is None
