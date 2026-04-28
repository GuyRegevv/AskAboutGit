import pytest
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient


def test_chat_deep_mode_uses_chroma(monkeypatch, tmp_path):
    monkeypatch.setenv("CHROMA_PERSIST_DIR", str(tmp_path))
    import importlib, state, main
    importlib.reload(state)
    importlib.reload(main)

    from indexer.types import Chunk

    class FakeEmbedder:
        async def embed_batch(self, texts):
            return [[1.0, 0.0] for _ in texts]

    state.embedder = FakeEmbedder()
    state.chroma_store.upsert(
        "alice", "demo",
        [Chunk(text="auth handler", file_path="auth.py", start_line=1, end_line=3, language="python")],
        [[1.0, 0.0]],
    )
    state.context_cache.set("alice/demo", {"README.md": "# demo"})

    captured: dict = {}

    async def fake_stream(context, question):
        captured["context"] = context
        yield "ok"

    monkeypatch.setattr("api.chat.stream_chat", fake_stream)

    with TestClient(main.app) as client:
        resp = client.post(
            "/api/chat",
            json={"owner": "alice", "repo": "demo", "question": "how does auth work?", "mode": "deep"},
        )
        assert resp.status_code == 200

    ctx = captured["context"]
    assert "README.md" in ctx
    # Retrieved chunk header should appear keyed by file_path with lines
    assert any("auth.py" in k for k in ctx.keys())


def test_chat_deep_mode_404_when_no_collection(monkeypatch, tmp_path):
    monkeypatch.setenv("CHROMA_PERSIST_DIR", str(tmp_path))
    import importlib, state, main
    importlib.reload(state)
    importlib.reload(main)
    state.context_cache.set("alice/demo", {"README.md": "# demo"})

    with TestClient(main.app) as client:
        resp = client.post(
            "/api/chat",
            json={"owner": "alice", "repo": "demo", "question": "x", "mode": "deep"},
        )
        assert resp.status_code == 409
        assert "deep mode" in resp.json()["detail"].lower()
