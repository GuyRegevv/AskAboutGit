from unittest.mock import patch

from fastapi.testclient import TestClient

from indexer.tarball import ExtractedFile
from indexer.types import ProgressEvent


def _events_from_response(text: str) -> list[str]:
    return [line[6:] for line in text.splitlines() if line.startswith("data: ")]


def test_index_route_streams_progress(monkeypatch, tmp_path):
    monkeypatch.setenv("CHROMA_PERSIST_DIR", str(tmp_path))
    # Reload state so it picks up the env var in this test session
    import importlib, state, main
    importlib.reload(state)
    importlib.reload(main)

    async def fake_fetcher(owner, repo):
        return [ExtractedFile(path="a.py", content="def foo():\n    return 1\n")]

    class FakeEmbedder:
        async def embed_batch(self, texts):
            return [[1.0, 0.0] for _ in texts]

    state.embedder = FakeEmbedder()

    with patch("api.index.fetch_files", new=fake_fetcher):
        with TestClient(main.app) as client:
            resp = client.post("/api/index/alice/demo")
            assert resp.status_code == 200
            events = _events_from_response(resp.text)
            assert any('"phase":"downloading"' in e for e in events)
            assert any('"phase":"ready"' in e for e in events)
            assert events[-1] == "[DONE]"
