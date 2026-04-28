# Phase 2 — Deep Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "Deep mode" that indexes a repo into ChromaDB and answers questions via vector retrieval, with phased SSE progress feedback.

**Architecture:** A new `indexer/` pipeline downloads the repo as a tarball, chunks files with an AST-aware splitter, embeds chunks via OpenAI, and persists them in an in-process ChromaDB on a mounted PVC. A new SSE route streams progress events. The chat route gains a `deep` mode that retrieves top-k chunks at query time and prepends them to the existing high-priority files.

**Tech Stack:** FastAPI, ChromaDB (in-process), `langchain-text-splitters` (tree-sitter under the hood), OpenAI `text-embedding-3-small`, React, TypeScript, k3s.

---

## File Structure

### Backend — new files
- `backend/indexer/__init__.py`
- `backend/indexer/types.py` — shared `Chunk`, `ProgressEvent`, `IndexResult` dataclasses
- `backend/indexer/tarball.py` — fetch + extract + walk + skip-list + size cap
- `backend/indexer/chunker.py` — AST-aware chunking dispatcher
- `backend/indexer/embedder.py` — `Embedder` Protocol + `OpenAIEmbedder`
- `backend/indexer/pipeline.py` — async generator orchestrating stages
- `backend/vectorstore/__init__.py`
- `backend/vectorstore/chroma.py` — `PersistentClient` wrapper
- `backend/api/index.py` — `POST /api/index/:owner/:repo` SSE route
- `backend/tests/test_tarball.py`
- `backend/tests/test_chunker.py`
- `backend/tests/test_embedder.py`
- `backend/tests/test_chroma.py`
- `backend/tests/test_pipeline.py`
- `backend/tests/test_index_route.py`

### Backend — modified files
- `backend/requirements.txt` — add chromadb, langchain-text-splitters
- `backend/state.py` — add chroma client + indexing rate limiter
- `backend/api/chat.py` — accept `mode`, route to deep retrieval
- `backend/main.py` — mount new index router
- `backend/Dockerfile` — install new deps
- `backend/selector/selector.py` — extract the skip-list predicate so the indexer can reuse it (no behavior change)

### Frontend — new files
- `frontend/src/components/DeepModeBanner.tsx`
- `frontend/src/components/DeepModeBanner.test.tsx`
- `frontend/src/lib/deepMode.ts` — `DeepModeState` type + reducer-style helpers
- `frontend/src/lib/deepMode.test.ts`

### Frontend — modified files
- `frontend/src/lib/api.ts` — add `streamIndex`, extend `streamChat` with `mode`
- `frontend/src/lib/api.test.ts` — new tests for SSE parsing
- `frontend/src/pages/ChatPage.tsx` — wire mode + DeepModeBanner

### Infrastructure
- `k8s/backend-pvc.yaml` (new) — `PersistentVolumeClaim` for `/data/chroma`
- `k8s/backend-deployment.yaml` (modified) — mount the PVC

---

## Task 1: Add backend dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add dependencies**

Append to `backend/requirements.txt`:

```
chromadb==0.5.5
langchain-text-splitters==0.3.0
```

- [ ] **Step 2: Install in venv**

Run from `backend/`:
```bash
source venv/bin/activate
pip install -r requirements.txt
```
Expected: both packages install without conflicts.

- [ ] **Step 3: Verify imports work**

```bash
python -c "import chromadb; from langchain_text_splitters import RecursiveCharacterTextSplitter, Language; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add chromadb and langchain-text-splitters for phase 2"
```

---

## Task 2: Indexer shared types

**Files:**
- Create: `backend/indexer/__init__.py` (empty)
- Create: `backend/indexer/types.py`
- Create: `backend/tests/test_indexer_types.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_indexer_types.py`:

```python
from indexer.types import Chunk, ProgressEvent


def test_chunk_holds_text_and_metadata():
    c = Chunk(
        text="def foo(): pass",
        file_path="src/a.py",
        start_line=1,
        end_line=1,
        language="python",
    )
    assert c.text == "def foo(): pass"
    assert c.file_path == "src/a.py"
    assert c.language == "python"


def test_progress_event_phases():
    ev = ProgressEvent(phase="embedding", current=10, total=100, message=None)
    assert ev.phase == "embedding"
    assert ev.current == 10
    assert ev.total == 100
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd backend && pytest tests/test_indexer_types.py -v`
Expected: FAIL — module `indexer.types` not found.

- [ ] **Step 3: Implement**

`backend/indexer/__init__.py`: empty file.

`backend/indexer/types.py`:

```python
from dataclasses import dataclass
from typing import Literal, Optional

Phase = Literal[
    "downloading",
    "extracting",
    "selecting",
    "chunking",
    "embedding",
    "storing",
    "ready",
    "failed",
    "too_large",
]


@dataclass(frozen=True)
class Chunk:
    text: str
    file_path: str
    start_line: int
    end_line: int
    language: str


@dataclass(frozen=True)
class ProgressEvent:
    phase: Phase
    current: Optional[int] = None
    total: Optional[int] = None
    message: Optional[str] = None
```

- [ ] **Step 4: Run test, expect pass**

Run: `pytest tests/test_indexer_types.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/indexer backend/tests/test_indexer_types.py
git commit -m "feat(indexer): add Chunk and ProgressEvent dataclasses"
```

---

## Task 3: Extract reusable skip-list predicate from selector

**Files:**
- Modify: `backend/selector/selector.py`
- Modify: `backend/tests/test_selector.py` (add a test for the new helper)

The indexer needs the same skip rules the selector applies (tests, lock files, binaries, vendored dirs). Pull the predicate into a public helper without changing existing behavior.

- [ ] **Step 1: Read current selector**

```bash
cat backend/selector/selector.py
```
Note where the skip logic lives (function names, regexes, sets).

- [ ] **Step 2: Add a test for the new helper**

Add to `backend/tests/test_selector.py`:

```python
from selector.selector import should_skip_path


def test_should_skip_path_skips_tests_and_locks():
    assert should_skip_path("tests/test_foo.py") is True
    assert should_skip_path("package-lock.json") is True
    assert should_skip_path("node_modules/foo/index.js") is True


def test_should_skip_path_keeps_source():
    assert should_skip_path("src/main.py") is False
    assert should_skip_path("README.md") is False
```

- [ ] **Step 3: Run test, expect failure**

Run: `pytest tests/test_selector.py -v -k should_skip`
Expected: FAIL — `should_skip_path` not defined.

- [ ] **Step 4: Refactor selector**

In `backend/selector/selector.py`, expose `should_skip_path(path: str) -> bool` as a module-level function that contains the existing skip rules. Have the existing scoring logic call it. Do not change scoring behavior.

- [ ] **Step 5: Run all selector tests, expect pass**

Run: `pytest tests/test_selector.py -v`
Expected: all existing tests still pass + the new ones.

- [ ] **Step 6: Commit**

```bash
git add backend/selector/selector.py backend/tests/test_selector.py
git commit -m "refactor(selector): expose should_skip_path for reuse by indexer"
```

---

## Task 4: Embedder Protocol + OpenAIEmbedder

**Files:**
- Create: `backend/indexer/embedder.py`
- Create: `backend/tests/test_embedder.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_embedder.py`:

```python
import pytest
from unittest.mock import AsyncMock

from indexer.embedder import OpenAIEmbedder


@pytest.mark.asyncio
async def test_openai_embedder_calls_api_in_batches():
    fake_client = AsyncMock()
    fake_client.embeddings.create = AsyncMock(side_effect=[
        type("R", (), {"data": [type("D", (), {"embedding": [0.1, 0.2]})() for _ in range(2)]})(),
        type("R", (), {"data": [type("D", (), {"embedding": [0.3, 0.4]})()]})(),
    ])
    embedder = OpenAIEmbedder(client=fake_client, model="test-model", batch_size=2)

    result = await embedder.embed_batch(["a", "b", "c"])

    assert len(result) == 3
    assert result[0] == [0.1, 0.2]
    assert fake_client.embeddings.create.await_count == 2


@pytest.mark.asyncio
async def test_openai_embedder_empty_input():
    fake_client = AsyncMock()
    embedder = OpenAIEmbedder(client=fake_client, model="m", batch_size=10)

    result = await embedder.embed_batch([])

    assert result == []
    fake_client.embeddings.create.assert_not_called()
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_embedder.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/indexer/embedder.py`:

```python
import os
from typing import Protocol

from openai import AsyncOpenAI


class Embedder(Protocol):
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


class OpenAIEmbedder:
    def __init__(
        self,
        client: AsyncOpenAI | None = None,
        model: str | None = None,
        batch_size: int = 100,
    ):
        self._client = client or AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self._model = model or os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        self._batch_size = batch_size

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i : i + self._batch_size]
            resp = await self._client.embeddings.create(model=self._model, input=batch)
            out.extend(d.embedding for d in resp.data)
        return out
```

- [ ] **Step 4: Run test, expect pass**

Run: `pytest tests/test_embedder.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/indexer/embedder.py backend/tests/test_embedder.py
git commit -m "feat(indexer): add Embedder Protocol and OpenAIEmbedder"
```

---

## Task 5: Tarball fetch + extract + walk

**Files:**
- Create: `backend/indexer/tarball.py`
- Create: `backend/tests/test_tarball.py`
- Create: `backend/tests/fixtures/sample-repo.tar.gz` (built in step 1)

- [ ] **Step 1: Build a tiny fixture tarball**

Run from repo root:

```bash
mkdir -p backend/tests/fixtures
tmp=$(mktemp -d)
mkdir -p "$tmp/sample-abc/src" "$tmp/sample-abc/tests" "$tmp/sample-abc/node_modules"
echo "# Sample" > "$tmp/sample-abc/README.md"
echo "def main(): pass" > "$tmp/sample-abc/src/main.py"
echo "def test_x(): pass" > "$tmp/sample-abc/tests/test_x.py"
echo "junk" > "$tmp/sample-abc/node_modules/junk.js"
tar -czf backend/tests/fixtures/sample-repo.tar.gz -C "$tmp" sample-abc
rm -rf "$tmp"
```

- [ ] **Step 2: Write failing test**

`backend/tests/test_tarball.py`:

```python
import pytest
from pathlib import Path

from indexer.tarball import extract_and_walk, FileTooLargeError


FIXTURE = Path(__file__).parent / "fixtures" / "sample-repo.tar.gz"


def test_extract_and_walk_returns_source_files_only():
    files = extract_and_walk(FIXTURE.read_bytes(), file_cap=100)

    paths = sorted(f.path for f in files)
    assert "README.md" in paths
    assert "src/main.py" in paths
    assert all("tests/" not in p for p in paths)
    assert all("node_modules/" not in p for p in paths)


def test_extract_and_walk_enforces_file_cap():
    with pytest.raises(FileTooLargeError) as exc:
        extract_and_walk(FIXTURE.read_bytes(), file_cap=1)
    assert exc.value.count >= 2
    assert exc.value.limit == 1


def test_extracted_file_has_content():
    files = extract_and_walk(FIXTURE.read_bytes(), file_cap=100)
    by_path = {f.path: f.content for f in files}
    assert "def main()" in by_path["src/main.py"]
```

- [ ] **Step 3: Run test, expect failure**

Run: `pytest tests/test_tarball.py -v`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`backend/indexer/tarball.py`:

```python
import io
import tarfile
from dataclasses import dataclass
from typing import Optional

import httpx

from selector.selector import should_skip_path


GITHUB_TARBALL_URL = "https://api.github.com/repos/{owner}/{repo}/tarball"
MAX_FILE_BYTES = 1_000_000  # skip individual files larger than 1MB


@dataclass(frozen=True)
class ExtractedFile:
    path: str
    content: str


class FileTooLargeError(Exception):
    def __init__(self, count: int, limit: int):
        super().__init__(f"Repo has {count} source files, exceeds limit of {limit}")
        self.count = count
        self.limit = limit


async def fetch_tarball(
    owner: str, repo: str, github_token: Optional[str] = None
) -> bytes:
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        resp = await client.get(
            GITHUB_TARBALL_URL.format(owner=owner, repo=repo), headers=headers
        )
        resp.raise_for_status()
        return resp.content


def extract_and_walk(tarball_bytes: bytes, file_cap: int) -> list[ExtractedFile]:
    out: list[ExtractedFile] = []
    with tarfile.open(fileobj=io.BytesIO(tarball_bytes), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            # Strip the top-level directory GitHub adds (e.g. "owner-repo-sha/")
            parts = member.name.split("/", 1)
            if len(parts) < 2:
                continue
            rel_path = parts[1]
            if should_skip_path(rel_path):
                continue
            if member.size > MAX_FILE_BYTES:
                continue
            f = tar.extractfile(member)
            if f is None:
                continue
            try:
                text = f.read().decode("utf-8")
            except UnicodeDecodeError:
                continue
            out.append(ExtractedFile(path=rel_path, content=text))

    if len(out) > file_cap:
        raise FileTooLargeError(count=len(out), limit=file_cap)
    return out
```

- [ ] **Step 5: Run test, expect pass**

Run: `pytest tests/test_tarball.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/indexer/tarball.py backend/tests/test_tarball.py backend/tests/fixtures/sample-repo.tar.gz
git commit -m "feat(indexer): tarball fetch, extract, and walk with skip-list and size cap"
```

---

## Task 6: AST-aware chunker

**Files:**
- Create: `backend/indexer/chunker.py`
- Create: `backend/tests/test_chunker.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_chunker.py`:

```python
from indexer.chunker import chunk_files
from indexer.tarball import ExtractedFile


def test_chunk_python_file_produces_chunks_with_metadata():
    files = [
        ExtractedFile(
            path="a.py",
            content="def foo():\n    return 1\n\n\ndef bar():\n    return 2\n",
        )
    ]
    chunks = chunk_files(files)
    assert len(chunks) >= 1
    for c in chunks:
        assert c.file_path == "a.py"
        assert c.language == "python"
        assert c.text.strip() != ""


def test_chunk_unknown_extension_falls_back():
    files = [ExtractedFile(path="notes.txt", content="hello world\n" * 50)]
    chunks = chunk_files(files)
    assert len(chunks) >= 1
    assert chunks[0].language == "text"


def test_chunk_skips_empty_files():
    files = [ExtractedFile(path="a.py", content="")]
    chunks = chunk_files(files)
    assert chunks == []
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_chunker.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/indexer/chunker.py`:

```python
from langchain_text_splitters import (
    Language,
    RecursiveCharacterTextSplitter,
)

from indexer.tarball import ExtractedFile
from indexer.types import Chunk


CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200

_EXT_TO_LANGUAGE: dict[str, Language] = {
    ".py": Language.PYTHON,
    ".js": Language.JS,
    ".jsx": Language.JS,
    ".ts": Language.TS,
    ".tsx": Language.TS,
    ".go": Language.GO,
    ".rs": Language.RUST,
    ".java": Language.JAVA,
    ".rb": Language.RUBY,
    ".php": Language.PHP,
    ".cs": Language.CSHARP,
    ".cpp": Language.CPP,
    ".c": Language.CPP,
    ".kt": Language.KOTLIN,
    ".swift": Language.SWIFT,
    ".md": Language.MARKDOWN,
}

_LANGUAGE_NAME = {
    Language.PYTHON: "python",
    Language.JS: "javascript",
    Language.TS: "typescript",
    Language.GO: "go",
    Language.RUST: "rust",
    Language.JAVA: "java",
    Language.RUBY: "ruby",
    Language.PHP: "php",
    Language.CSHARP: "csharp",
    Language.CPP: "cpp",
    Language.KOTLIN: "kotlin",
    Language.SWIFT: "swift",
    Language.MARKDOWN: "markdown",
}


def _splitter_for(path: str) -> tuple[RecursiveCharacterTextSplitter, str]:
    ext = "." + path.rsplit(".", 1)[-1].lower() if "." in path else ""
    lang = _EXT_TO_LANGUAGE.get(ext)
    if lang is None:
        return (
            RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
            ),
            "text",
        )
    return (
        RecursiveCharacterTextSplitter.from_language(
            language=lang, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
        ),
        _LANGUAGE_NAME[lang],
    )


def chunk_files(files: list[ExtractedFile]) -> list[Chunk]:
    out: list[Chunk] = []
    for f in files:
        if not f.content.strip():
            continue
        splitter, language = _splitter_for(f.path)
        pieces = splitter.split_text(f.content)
        cursor = 0
        for piece in pieces:
            if not piece.strip():
                continue
            start = f.content.find(piece, cursor)
            if start == -1:
                start = cursor
            start_line = f.content.count("\n", 0, start) + 1
            end_line = start_line + piece.count("\n")
            cursor = start + len(piece)
            out.append(
                Chunk(
                    text=piece,
                    file_path=f.path,
                    start_line=start_line,
                    end_line=end_line,
                    language=language,
                )
            )
    return out
```

- [ ] **Step 4: Run test, expect pass**

Run: `pytest tests/test_chunker.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/indexer/chunker.py backend/tests/test_chunker.py
git commit -m "feat(indexer): AST-aware chunker via langchain text splitters"
```

---

## Task 7: ChromaDB vector store wrapper

**Files:**
- Create: `backend/vectorstore/__init__.py` (empty)
- Create: `backend/vectorstore/chroma.py`
- Create: `backend/tests/test_chroma.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_chroma.py`:

```python
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_chroma.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/vectorstore/__init__.py`: empty.

`backend/vectorstore/chroma.py`:

```python
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `pytest tests/test_chroma.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/vectorstore backend/tests/test_chroma.py
git commit -m "feat(vectorstore): ChromaStore wrapper with upsert, query, TTL helpers"
```

---

## Task 8: Indexing pipeline orchestrator

**Files:**
- Create: `backend/indexer/pipeline.py`
- Create: `backend/tests/test_pipeline.py`

- [ ] **Step 1: Write failing tests**

`backend/tests/test_pipeline.py`:

```python
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_pipeline.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/indexer/pipeline.py`:

```python
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `pytest tests/test_pipeline.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/indexer/pipeline.py backend/tests/test_pipeline.py
git commit -m "feat(indexer): pipeline orchestrator with progress events"
```

---

## Task 9: Wire singletons in state.py

**Files:**
- Modify: `backend/state.py`

- [ ] **Step 1: Replace state.py contents**

```python
import os
import asyncio
from collections import defaultdict

from context_cache.cache import ContextCache
from rate_limit.limiter import RateLimiter
from vectorstore.chroma import ChromaStore
from indexer.embedder import OpenAIEmbedder

context_cache = ContextCache(ttl_minutes=int(os.getenv("CONTEXT_CACHE_TTL_MINUTES", "30")))

rate_limiter = RateLimiter(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20")),
    window_hours=int(os.getenv("RATE_LIMIT_WINDOW_HOURS", "1")),
)

indexing_rate_limiter = RateLimiter(
    max_requests=int(os.getenv("INDEXING_RATE_LIMIT_PER_HOUR", "5")),
    window_hours=1,
)

chroma_store = ChromaStore(
    persist_dir=os.getenv("CHROMA_PERSIST_DIR", "/data/chroma"),
)

embedder = OpenAIEmbedder()

DEEP_MODE_TTL_SECONDS = int(os.getenv("DEEP_MODE_TTL_SECONDS", "86400"))
DEEP_MODE_FILE_CAP = int(os.getenv("DEEP_MODE_FILE_CAP", "1500"))
DEEP_MODE_TOP_K = int(os.getenv("DEEP_MODE_TOP_K", "8"))

# Per-(owner,repo) async locks so concurrent indexing requests coalesce.
_locks: dict[tuple[str, str], asyncio.Lock] = defaultdict(asyncio.Lock)


def index_lock(owner: str, repo: str) -> asyncio.Lock:
    return _locks[(owner, repo)]
```

- [ ] **Step 2: Sanity check imports**

```bash
cd backend && python -c "import state; print(state.DEEP_MODE_TOP_K)"
```
Expected: `8` (or whatever env provides). May fail on `chromadb` PersistentClient if `/data/chroma` is not writable; if so, set `CHROMA_PERSIST_DIR=/tmp/chroma` in your shell for local dev.

- [ ] **Step 3: Run existing tests to ensure nothing broke**

```bash
CHROMA_PERSIST_DIR=/tmp/chroma-test pytest -v
```
Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/state.py
git commit -m "feat(state): register chroma store, embedder, indexing rate limiter, locks"
```

---

## Task 10: Indexing API route (SSE)

**Files:**
- Create: `backend/api/index.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_index_route.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_index_route.py`:

```python
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_index_route.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`backend/api/index.py`:

```python
import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

import state
from indexer.pipeline import run_indexing
from indexer.tarball import fetch_tarball, extract_and_walk, ExtractedFile
from indexer.types import ProgressEvent

router = APIRouter()


async def fetch_files(owner: str, repo: str) -> list[ExtractedFile]:
    raw = await fetch_tarball(owner, repo, github_token=os.getenv("GITHUB_TOKEN"))
    return extract_and_walk(raw, file_cap=state.DEEP_MODE_FILE_CAP)


def _serialize(ev: ProgressEvent) -> str:
    return json.dumps(
        {
            "phase": ev.phase,
            "current": ev.current,
            "total": ev.total,
            "message": ev.message,
        },
        separators=(",", ":"),
    )


@router.post("/index/{owner}/{repo}")
async def index_repo(owner: str, repo: str, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not state.indexing_rate_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="Indexing rate limit reached. Try again later.",
        )

    async def generate():
        async with state.index_lock(owner, repo):
            age = state.chroma_store.collection_age_seconds(owner, repo)
            if age is not None and age < state.DEEP_MODE_TTL_SECONDS:
                yield f"data: {_serialize(ProgressEvent(phase='ready'))}\n\n"
                yield "data: [DONE]\n\n"
                return
            try:
                async for ev in run_indexing(
                    owner=owner,
                    repo=repo,
                    fetcher=fetch_files,
                    embedder=state.embedder,
                    store=state.chroma_store,
                ):
                    yield f"data: {_serialize(ev)}\n\n"
            except Exception as e:
                yield f"data: {_serialize(ProgressEvent(phase='failed', message=str(e)[:200]))}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

- [ ] **Step 4: Mount the router in `backend/main.py`**

Find the existing router mounts (e.g., `app.include_router(repo.router, prefix="/api")`) and add:

```python
from api import index as index_route
app.include_router(index_route.router, prefix="/api")
```

- [ ] **Step 5: Run test, expect pass**

Run: `CHROMA_PERSIST_DIR=/tmp/chroma-test pytest tests/test_index_route.py -v`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/api/index.py backend/main.py backend/tests/test_index_route.py
git commit -m "feat(api): SSE indexing route with rate limit and lock coalescing"
```

---

## Task 11: Extend chat route with deep mode

**Files:**
- Modify: `backend/api/chat.py`
- Modify: `backend/llm/streaming.py` (accept already-built context dict)
- Create: `backend/tests/test_chat_deep_mode.py`

- [ ] **Step 1: Write failing test**

`backend/tests/test_chat_deep_mode.py`:

```python
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_chat_deep_mode.py -v`
Expected: FAIL — `mode` not on schema, no deep handling.

- [ ] **Step 3: Update chat route**

Replace `backend/api/chat.py` with:

```python
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from llm.streaming import stream_chat
import state

router = APIRouter()


class ChatRequest(BaseModel):
    owner: str
    repo: str
    question: str
    mode: Literal["free", "deep"] = "free"


async def _build_deep_context(
    owner: str, repo: str, question: str, base_context: dict[str, str]
) -> dict[str, str]:
    age = state.chroma_store.collection_age_seconds(owner, repo)
    if age is None or age >= state.DEEP_MODE_TTL_SECONDS:
        raise HTTPException(
            status_code=409,
            detail="Deep mode index not ready for this repo. Run indexing first.",
        )
    [q_emb] = await state.embedder.embed_batch([question])
    chunks = state.chroma_store.query(owner, repo, q_emb, k=state.DEEP_MODE_TOP_K)
    merged = dict(base_context)
    for c in chunks:
        key = f"{c.file_path}:{c.start_line}-{c.end_line}"
        merged[key] = c.text
    return merged


@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not state.rate_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="You've reached the request limit. Try again in an hour.",
        )

    cache_key = f"{body.owner}/{body.repo}"
    base_context = state.context_cache.get(cache_key)
    if base_context is None:
        raise HTTPException(
            status_code=404,
            detail="Repo context not found. Reload the page and try again.",
        )

    if body.mode == "deep":
        context = await _build_deep_context(
            body.owner, body.repo, body.question, base_context
        )
    else:
        context = base_context

    async def generate():
        try:
            async for token in stream_chat(context, body.question):
                encoded = token.replace("\n", "\\n")
                yield f"data: {encoded}\n\n"
        except Exception:
            yield "data: [ERROR]\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

- [ ] **Step 4: Run test, expect pass**

Run: `CHROMA_PERSIST_DIR=/tmp/chroma-test pytest tests/test_chat_deep_mode.py -v`
Expected: 2 passed.

- [ ] **Step 5: Run full backend suite**

Run: `CHROMA_PERSIST_DIR=/tmp/chroma-test pytest -v`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/api/chat.py backend/tests/test_chat_deep_mode.py
git commit -m "feat(api): chat route deep mode retrieves chunks from chroma"
```

---

## Task 12: Frontend deep-mode state types

**Files:**
- Create: `frontend/src/lib/deepMode.ts`
- Create: `frontend/src/lib/deepMode.test.ts`

- [ ] **Step 1: Write failing tests**

`frontend/src/lib/deepMode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyEvent, initialDeepState } from './deepMode'

describe('deepMode reducer', () => {
  it('starts idle', () => {
    expect(initialDeepState.kind).toBe('idle')
  })

  it('moves to indexing on a phase event', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'embedding',
      current: 10,
      total: 100,
      message: null,
    })
    expect(next.kind).toBe('indexing')
    if (next.kind === 'indexing') {
      expect(next.phase).toBe('embedding')
      expect(next.progress).toEqual({ current: 10, total: 100 })
    }
  })

  it('moves to ready', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'ready', current: null, total: null, message: null,
    })
    expect(next.kind).toBe('ready')
  })

  it('moves to too_large with counts', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'too_large', current: 5000, total: 1500, message: null,
    })
    expect(next).toEqual({ kind: 'too_large', count: 5000, limit: 1500 })
  })

  it('moves to failed with message', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'failed', current: null, total: null, message: 'boom',
    })
    expect(next).toEqual({ kind: 'failed', message: 'boom' })
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run from `frontend/`: `npm test -- deepMode`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/lib/deepMode.ts`:

```ts
export type IndexEvent = {
  phase:
    | 'downloading' | 'extracting' | 'selecting' | 'chunking'
    | 'embedding' | 'storing' | 'ready' | 'failed' | 'too_large'
  current: number | null
  total: number | null
  message: string | null
}

export type DeepModeState =
  | { kind: 'idle' }
  | { kind: 'indexing'; phase: IndexEvent['phase']; progress?: { current: number; total: number } }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string }
  | { kind: 'too_large'; count: number; limit: number }

export const initialDeepState: DeepModeState = { kind: 'idle' }

export function applyEvent(_prev: DeepModeState, ev: IndexEvent): DeepModeState {
  if (ev.phase === 'ready') return { kind: 'ready' }
  if (ev.phase === 'failed') {
    return { kind: 'failed', message: ev.message ?? 'Indexing failed' }
  }
  if (ev.phase === 'too_large') {
    return { kind: 'too_large', count: ev.current ?? 0, limit: ev.total ?? 0 }
  }
  const progress =
    ev.current != null && ev.total != null
      ? { current: ev.current, total: ev.total }
      : undefined
  return { kind: 'indexing', phase: ev.phase, progress }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- deepMode`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/deepMode.ts frontend/src/lib/deepMode.test.ts
git commit -m "feat(frontend): deep mode state types and reducer"
```

---

## Task 13: Frontend api.ts — streamIndex + mode

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/api.test.ts` (if not exists; otherwise modify)

- [ ] **Step 1: Write failing test**

`frontend/src/lib/api.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { streamIndex } from './api'
import type { IndexEvent } from './deepMode'

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l))
      c.close()
    },
  })
}

describe('streamIndex', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(sseStream([
        'data: {"phase":"downloading","current":null,"total":null,"message":null}\n\n',
        'data: {"phase":"ready","current":null,"total":null,"message":null}\n\n',
        'data: [DONE]\n\n',
      ]), { status: 200 })
    ))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('emits parsed events and ends', async () => {
    const events: IndexEvent[] = []
    const done = vi.fn()
    await streamIndex('o', 'r', e => events.push(e), done, () => {})
    expect(events.map(e => e.phase)).toEqual(['downloading', 'ready'])
    expect(done).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- api.test`
Expected: FAIL — `streamIndex` not exported.

- [ ] **Step 3: Update `frontend/src/lib/api.ts`**

Replace contents:

```ts
import type { IndexEvent } from './deepMode'

export async function loadRepo(owner: string, repo: string): Promise<string[]> {
  const res = await fetch(`/api/repo/${owner}/${repo}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Failed to load repository (${res.status})`)
  }
  const data = await res.json()
  return data.files as string[]
}

export async function streamChat(
  owner: string,
  repo: string,
  question: string,
  mode: 'free' | 'deep',
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, question, mode }),
    })
  } catch {
    onError('Network error. Check your connection and try again.')
    return
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    onError(body.detail ?? `Request failed (${response.status})`)
    return
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const text = line.slice(6).replace(/\\n/g, '\n')
      if (text === '[DONE]') { onDone(); return }
      if (text === '[ERROR]') { onError('The AI encountered an error. Please try again.'); return }
      onToken(text)
    }
  }
  onDone()
}

export async function streamIndex(
  owner: string,
  repo: string,
  onEvent: (ev: IndexEvent) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/index/${owner}/${repo}`, { method: 'POST' })
  } catch {
    onError('Network error. Check your connection and try again.')
    return
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    onError(body.detail ?? `Indexing failed (${response.status})`)
    return
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') { onDone(); return }
      try {
        onEvent(JSON.parse(payload) as IndexEvent)
      } catch {
        // ignore malformed lines
      }
    }
  }
  onDone()
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test`
Expected: all pass. Existing `streamChat` callers will fail TypeScript compile because of the new `mode` argument — that's intentional and is fixed in Task 15.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat(frontend): streamIndex SSE reader, streamChat accepts mode"
```

---

## Task 14: DeepModeBanner component

**Files:**
- Create: `frontend/src/components/DeepModeBanner.tsx`
- Create: `frontend/src/components/DeepModeBanner.test.tsx`

- [ ] **Step 1: Write failing tests**

`frontend/src/components/DeepModeBanner.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeepModeBanner } from './DeepModeBanner'

describe('DeepModeBanner', () => {
  it('idle: shows enable button and fires callback', () => {
    const onEnable = vi.fn()
    render(<DeepModeBanner state={{ kind: 'idle' }} onEnable={onEnable} onRetry={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /enable deep mode/i }))
    expect(onEnable).toHaveBeenCalledOnce()
  })

  it('indexing: shows phase and progress', () => {
    render(
      <DeepModeBanner
        state={{ kind: 'indexing', phase: 'embedding', progress: { current: 30, total: 100 } }}
        onEnable={() => {}} onRetry={() => {}}
      />
    )
    expect(screen.getByText(/embedding/i)).toBeInTheDocument()
    expect(screen.getByText(/30\s*\/\s*100/)).toBeInTheDocument()
  })

  it('ready: shows confirmation badge', () => {
    render(<DeepModeBanner state={{ kind: 'ready' }} onEnable={() => {}} onRetry={() => {}} />)
    expect(screen.getByText(/deep mode active/i)).toBeInTheDocument()
  })

  it('too_large: shows counts', () => {
    render(
      <DeepModeBanner
        state={{ kind: 'too_large', count: 5000, limit: 1500 }}
        onEnable={() => {}} onRetry={() => {}}
      />
    )
    expect(screen.getByText(/5000/)).toBeInTheDocument()
    expect(screen.getByText(/1500/)).toBeInTheDocument()
  })

  it('failed: shows retry button', () => {
    const onRetry = vi.fn()
    render(
      <DeepModeBanner
        state={{ kind: 'failed', message: 'boom' }}
        onEnable={() => {}} onRetry={onRetry}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- DeepModeBanner`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/components/DeepModeBanner.tsx`:

```tsx
import type { DeepModeState } from '@/lib/deepMode'

type Props = {
  state: DeepModeState
  onEnable: () => void
  onRetry: () => void
}

export function DeepModeBanner({ state, onEnable, onRetry }: Props) {
  if (state.kind === 'idle') {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm flex items-center justify-between">
        <span className="text-zinc-300">
          Want answers backed by the full repo? Enable Deep mode to index every file.
        </span>
        <button
          onClick={onEnable}
          className="ml-4 rounded bg-amber-500 px-3 py-1 text-zinc-900 font-medium hover:bg-amber-400"
        >
          Enable Deep mode
        </button>
      </div>
    )
  }

  if (state.kind === 'indexing') {
    const pct =
      state.progress && state.progress.total > 0
        ? Math.round((state.progress.current / state.progress.total) * 100)
        : null
    return (
      <div className="rounded-md border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm">
        <div className="flex items-center justify-between text-zinc-200">
          <span className="capitalize">{state.phase}…</span>
          {state.progress && (
            <span className="font-mono text-xs text-zinc-400">
              {state.progress.current} / {state.progress.total}
            </span>
          )}
        </div>
        {pct !== null && (
          <div className="mt-2 h-1 w-full rounded bg-zinc-800 overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    )
  }

  if (state.kind === 'ready') {
    return (
      <div className="rounded-md border border-emerald-700/40 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200">
        Deep mode active — answers use full repo context.
      </div>
    )
  }

  if (state.kind === 'too_large') {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
        This repo has {state.count} source files. Deep mode is capped at {state.limit}. Standard chat is still available.
      </div>
    )
  }

  return (
    <div className="rounded-md border border-rose-700/40 bg-rose-950/30 px-4 py-3 text-sm flex items-center justify-between">
      <span className="text-rose-200">Indexing failed: {state.message}</span>
      <button
        onClick={onRetry}
        className="ml-4 rounded bg-rose-500 px-3 py-1 text-zinc-900 font-medium hover:bg-rose-400"
      >
        Retry
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- DeepModeBanner`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DeepModeBanner.tsx frontend/src/components/DeepModeBanner.test.tsx
git commit -m "feat(frontend): DeepModeBanner component"
```

---

## Task 15: Wire DeepModeBanner into ChatPage

**Files:**
- Modify: `frontend/src/pages/ChatPage.tsx`

- [ ] **Step 1: Read current ChatPage**

```bash
cat frontend/src/pages/ChatPage.tsx
```
Identify where the chat UI is laid out and where `streamChat` is called.

- [ ] **Step 2: Add deep-mode state and handlers**

In `ChatPage.tsx`:

1. Add imports:

```tsx
import { useState } from 'react'
import { streamChat, streamIndex } from '@/lib/api'
import { DeepModeBanner } from '@/components/DeepModeBanner'
import { applyEvent, initialDeepState, type DeepModeState } from '@/lib/deepMode'
```

2. Add state inside the component:

```tsx
const [mode, setMode] = useState<'free' | 'deep'>('free')
const [deepState, setDeepState] = useState<DeepModeState>(initialDeepState)
```

3. Add the enable/retry handler:

```tsx
const startIndexing = () => {
  setDeepState({ kind: 'indexing', phase: 'downloading' })
  void streamIndex(
    owner,
    repo,
    ev => setDeepState(prev => applyEvent(prev, ev)),
    () => setDeepState(prev => {
      if (prev.kind === 'indexing') return { kind: 'ready' }
      return prev
    }),
    msg => setDeepState({ kind: 'failed', message: msg }),
  )
}
```

4. When `deepState.kind === 'ready'`, set `mode` to `'deep'`. Add:

```tsx
useEffect(() => {
  if (deepState.kind === 'ready') setMode('deep')
}, [deepState])
```

(Add `useEffect` to the React import.)

5. Update every existing call to `streamChat(...)` to pass `mode` as the new fourth argument.

6. Render the banner above the chat window:

```tsx
<DeepModeBanner state={deepState} onEnable={startIndexing} onRetry={startIndexing} />
```

- [ ] **Step 3: Run frontend type-check + tests**

```bash
cd frontend
npm run build
npm test
```
Expected: build passes, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ChatPage.tsx
git commit -m "feat(frontend): wire DeepModeBanner and mode into ChatPage"
```

---

## Task 16: Update Dockerfile and add k8s PVC

**Files:**
- Modify: `backend/Dockerfile`
- Create: `k8s/backend-pvc.yaml`
- Modify: `k8s/backend-deployment.yaml`

- [ ] **Step 1: Read current Dockerfile**

```bash
cat backend/Dockerfile
```
Verify `pip install -r requirements.txt` runs (it should already). No additional system packages are needed since we use `httpx` + `tarfile`, not `git`.

- [ ] **Step 2: Build the image locally to validate**

```bash
cd backend
docker build -t askaboutgit-backend:phase2-test .
```
Expected: build succeeds.

- [ ] **Step 3: Add PVC manifest**

`k8s/backend-pvc.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: askaboutgit-chroma
  namespace: askaboutgit
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

(Adjust `namespace` to match the existing manifests in `k8s/`.)

- [ ] **Step 4: Mount the PVC and set the env var on the deployment**

In `k8s/backend-deployment.yaml`, under the backend container spec add:

```yaml
        env:
        - name: CHROMA_PERSIST_DIR
          value: /data/chroma
        volumeMounts:
        - name: chroma-data
          mountPath: /data/chroma
      volumes:
      - name: chroma-data
        persistentVolumeClaim:
          claimName: askaboutgit-chroma
```

Merge these with the existing `env`/`volumeMounts`/`volumes` arrays — do not overwrite them.

- [ ] **Step 5: Apply (when ready to deploy)**

```bash
kubectl apply -f k8s/backend-pvc.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl rollout status deployment/askaboutgit-backend -n askaboutgit
```

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile k8s/backend-pvc.yaml k8s/backend-deployment.yaml
git commit -m "infra: add chroma PVC and mount on backend deployment"
```

---

## Task 17: End-to-end smoke test (manual)

- [ ] **Step 1: Start backend with a writable persist dir**

```bash
cd backend
source venv/bin/activate
CHROMA_PERSIST_DIR=/tmp/chroma-dev OPENAI_API_KEY=sk-... uvicorn main:app --reload
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend
npm run dev
```

- [ ] **Step 3: Open a small public repo in the browser**

Navigate to `http://localhost:5173/octocat/Hello-World`. The free-tier chat should load.

- [ ] **Step 4: Click "Enable Deep mode"**

Verify the banner shows phased progress (`downloading → chunking → embedding → ready`). The progress bar should update.

- [ ] **Step 5: Ask a question that requires retrieval**

Ask something like "What does the main script do?" and verify the answer references content that wasn't in the free-tier files.

- [ ] **Step 6: Verify TTL behavior**

Reload the page and click Deep mode again. The banner should jump to `ready` instantly (cache hit).

- [ ] **Step 7: Verify too-large path**

Navigate to a large repo (e.g., `torvalds/linux`). Click Deep mode. Verify the `too_large` banner renders with the count and the limit, and that free-tier chat still works.

No commit needed — this is verification only.

---

## Self-Review Notes

- Spec coverage cross-checked: indexing trigger (Task 15), in-process Chroma (Tasks 7, 9), chunking via langchain splitters (Task 6), OpenAI embeddings behind a Protocol (Task 4), retrieval = top-k + free-tier files (Task 11), TTL cache (Tasks 7, 10, 11), tarball source (Task 5), file-cap guard (Tasks 5, 8, 14), phased SSE progress (Tasks 8, 10, 13, 14), file structure matches spec, env vars match spec (Task 9), tests cover each module.
- Type names consistent across tasks: `Chunk`, `ProgressEvent`, `DeepModeState`, `IndexEvent`, `ChromaStore`, `OpenAIEmbedder`.
- All steps contain runnable code or commands; no TBDs.
