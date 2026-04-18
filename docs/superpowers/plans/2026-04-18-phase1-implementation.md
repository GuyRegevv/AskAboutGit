# AskAboutGit Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MVP where users visit `askaboutgit.guyregev.dev/owner/repo` and chat with an AI about any public GitHub repository.

**Architecture:** React frontend (served by Nginx) proxies `/api/*` to a FastAPI backend. The backend fetches repo file trees from GitHub API, selects ~10 key files, stores them in an in-memory TTL cache, and streams LLM responses via SSE. Nginx handles both static file serving and API proxying — only one external domain is needed.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui (frontend), Python 3.11 + FastAPI + Uvicorn + httpx + Anthropic SDK (backend), Nginx (frontend container), Docker (`linux/amd64`), k3s + Cloudflare Tunnel (deployment)

---

## File Map

```
askaboutgit/
  backend/
    main.py                        # FastAPI app, CORS, routers mounted here
    state.py                       # Shared singletons (ContextCache, RateLimiter) — avoids circular imports
    requirements.txt
    Dockerfile
    .env.example
    github/
      __init__.py
      client.py                    # GitHubClient: get_file_tree(), get_file_contents()
    selector/
      __init__.py
      selector.py                  # select_files(tree) -> list[str]
    context_cache/
      __init__.py
      cache.py                     # ContextCache: get(), set() with TTL
    rate_limit/
      __init__.py
      limiter.py                   # RateLimiter: is_allowed(ip) sliding window
    llm/
      __init__.py
      streaming.py                 # stream_chat(context_files, question) -> AsyncIterator[str]
    api/
      __init__.py
      repo.py                      # GET /api/repo/{owner}/{repo}
      chat.py                      # POST /api/chat
    tests/
      test_selector.py
      test_cache.py
      test_rate_limit.py
      test_github.py               # integration test (real GitHub API)
  frontend/
    package.json
    vite.config.ts
    tailwind.config.ts
    tsconfig.json
    index.html
    Dockerfile
    nginx.conf
    src/
      main.tsx
      App.tsx
      pages/
        LandingPage.tsx
        ChatPage.tsx
      components/
        ChatWindow.tsx
        ChatInput.tsx
        MessageBubble.tsx
      lib/
        api.ts                     # loadRepo(), streamChat() (fetch + ReadableStream SSE)
  k8s/
    namespace.yaml
    configmap.yaml
    deployment.yaml
    service.yaml
```

---

## Task 1: Backend Project Scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/main.py`
- Create: `backend/.env.example`
- Create: `backend/github/__init__.py`
- Create: `backend/selector/__init__.py`
- Create: `backend/context_cache/__init__.py`
- Create: `backend/rate_limit/__init__.py`
- Create: `backend/llm/__init__.py`
- Create: `backend/api/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p backend/{github,selector,context_cache,rate_limit,llm,api,tests}
touch backend/{github,selector,context_cache,rate_limit,llm,api,tests}/__init__.py
```

- [ ] **Step 2: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
anthropic==0.34.2
python-dotenv==1.0.1
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Create `backend/.env.example`**

```
GITHUB_TOKEN=ghp_your_token_here
ANTHROPIC_API_KEY=sk-ant-your_key_here
LLM_MODEL=claude-haiku-4-5-20251001
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_HOURS=1
CONTEXT_CACHE_TTL_MINUTES=30
FRONTEND_URL=https://askaboutgit.guyregev.dev
```

- [ ] **Step 4: Create `backend/main.py`**

```python
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.repo import router as repo_router
from api.chat import router as chat_router

load_dotenv()

app = FastAPI(title="AskAboutGit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "https://askaboutgit.guyregev.dev"),
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(repo_router, prefix="/api")
app.include_router(chat_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Install dependencies and verify startup**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Expected: Server starts on `http://127.0.0.1:8000`. Visit `http://127.0.0.1:8000/health` → `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend project structure"
```

---

## Task 2: Selector Module (TDD)

**Files:**
- Create: `backend/selector/selector.py`
- Create: `backend/tests/test_selector.py`

- [ ] **Step 1: Write failing tests in `backend/tests/test_selector.py`**

```python
import pytest
from selector.selector import select_files

SAMPLE_TREE = [
    "README.md",
    "package.json",
    "src/index.ts",
    "src/app.ts",
    "src/utils.ts",
    "src/auth.ts",
    "src/routes/users.ts",
    "src/routes/api.ts",
    "tests/auth.test.ts",
    "tests/utils.test.ts",
    "node_modules/express/index.js",
    "dist/bundle.js",
    "yarn.lock",
    "src/assets/logo.png",
    ".gitignore",
]


def test_readme_is_selected():
    result = select_files(SAMPLE_TREE)
    assert "README.md" in result


def test_package_json_is_selected():
    result = select_files(SAMPLE_TREE)
    assert "package.json" in result


def test_node_modules_excluded():
    result = select_files(SAMPLE_TREE)
    assert not any("node_modules" in p for p in result)


def test_dist_excluded():
    result = select_files(SAMPLE_TREE)
    assert not any("dist" in p for p in result)


def test_lock_files_excluded():
    result = select_files(SAMPLE_TREE)
    assert "yarn.lock" not in result


def test_test_files_excluded():
    result = select_files(SAMPLE_TREE)
    assert not any(".test." in p for p in result)


def test_image_assets_excluded():
    result = select_files(SAMPLE_TREE)
    assert "src/assets/logo.png" not in result


def test_max_ten_files():
    # Build a tree with 20 valid source files
    large_tree = [f"src/module{i}.ts" for i in range(20)]
    result = select_files(large_tree)
    assert len(result) <= 10


def test_readme_comes_first():
    result = select_files(SAMPLE_TREE)
    assert result[0] == "README.md"


def test_entry_point_scored_high():
    result = select_files(SAMPLE_TREE)
    # index.ts is an entry point, should rank above generic modules
    idx_index = result.index("src/index.ts") if "src/index.ts" in result else 999
    idx_utils = result.index("src/utils.ts") if "src/utils.ts" in result else 999
    assert idx_index < idx_utils
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
source venv/bin/activate
pytest tests/test_selector.py -v
```

Expected: `ImportError: No module named 'selector.selector'`

- [ ] **Step 3: Implement `backend/selector/selector.py`**

```python
import re
from pathlib import Path

SKIP_DIRS = {
    "node_modules", "vendor", ".git", "dist", "build",
    "__pycache__", ".cache", "coverage", ".next", "venv",
    "env", "target", ".tox",
}

SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".pdf",
    ".zip", ".tar", ".gz",
}

LOCK_FILES = {
    "yarn.lock", "package-lock.json", "poetry.lock",
    "cargo.lock", "pipfile.lock", "composer.lock", "go.sum",
}

TEST_PATTERN = re.compile(
    r"(test_|_test\.|\.test\.|\.spec\.|__tests__/)", re.IGNORECASE
)

ENTRY_POINTS = {
    "main.py", "main.ts", "main.js", "main.go", "main.rs",
    "index.ts", "index.js", "app.py", "app.ts", "app.js",
    "server.py", "server.ts", "server.js",
}

MANIFEST_FILES = {
    "package.json", "pyproject.toml", "go.mod", "cargo.toml",
    "setup.py", "setup.cfg", "composer.json", "gemfile",
    "build.gradle", "pom.xml",
}

CONFIG_EXTENSIONS = {".yaml", ".yml", ".toml", ".ini", ".cfg", ".env.example"}


def _score(path: str) -> int:
    """Return priority score. Return -1 to skip the file."""
    p = Path(path)
    parts = p.parts

    # Skip any path that passes through a skip directory
    if any(part in SKIP_DIRS for part in parts[:-1]):
        return -1

    name = p.name.lower()

    if name in LOCK_FILES:
        return -1
    if p.suffix.lower() in SKIP_EXTENSIONS:
        return -1
    if TEST_PATTERN.search(path):
        return -1

    # README (any extension or none)
    if name.startswith("readme"):
        return 100

    # Package manifests
    if name in MANIFEST_FILES:
        return 90

    # Entry points
    if name in ENTRY_POINTS:
        return 80

    # Root-level config files
    if len(parts) == 1 and p.suffix.lower() in CONFIG_EXTENSIONS:
        return 70

    # Everything else: deprioritize by depth
    depth_penalty = (len(parts) - 1) * 8
    return max(5, 55 - depth_penalty)


def select_files(tree: list[str], max_files: int = 10) -> list[str]:
    """Given a flat list of file paths, return up to max_files, highest priority first."""
    scored = [(path, _score(path)) for path in tree]
    valid = [(path, score) for path, score in scored if score >= 0]
    valid.sort(key=lambda x: x[1], reverse=True)
    return [path for path, _ in valid[:max_files]]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_selector.py -v
```

Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/selector/selector.py backend/tests/test_selector.py
git commit -m "feat: add file selector module with tests"
```

---

## Task 3: Context Cache Module (TDD)

**Files:**
- Create: `backend/context_cache/cache.py`
- Create: `backend/tests/test_cache.py`

- [ ] **Step 1: Write failing tests in `backend/tests/test_cache.py`**

```python
import time
import pytest
from context_cache.cache import ContextCache


def test_set_and_get_returns_value():
    cache = ContextCache(ttl_minutes=30)
    files = {"README.md": "# Hello", "src/index.ts": "console.log('hi')"}
    cache.set("facebook/react", files)
    result = cache.get("facebook/react")
    assert result == files


def test_missing_key_returns_none():
    cache = ContextCache(ttl_minutes=30)
    assert cache.get("owner/nonexistent") is None


def test_expired_entry_returns_none():
    cache = ContextCache(ttl_minutes=0)  # TTL of 0 = already expired
    cache.set("owner/repo", {"README.md": "content"})
    # Sleep a tiny bit to ensure time has passed
    time.sleep(0.01)
    assert cache.get("owner/repo") is None


def test_overwrite_resets_ttl():
    cache = ContextCache(ttl_minutes=30)
    cache.set("owner/repo", {"a.py": "old"})
    cache.set("owner/repo", {"a.py": "new"})
    assert cache.get("owner/repo") == {"a.py": "new"}


def test_different_keys_are_independent():
    cache = ContextCache(ttl_minutes=30)
    cache.set("owner/repo-a", {"a": "1"})
    cache.set("owner/repo-b", {"b": "2"})
    assert cache.get("owner/repo-a") == {"a": "1"}
    assert cache.get("owner/repo-b") == {"b": "2"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_cache.py -v
```

Expected: `ImportError: No module named 'context_cache.cache'`

- [ ] **Step 3: Implement `backend/context_cache/cache.py`**

```python
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class _Entry:
    files: dict[str, str]
    created_at: datetime = field(default_factory=datetime.now)


class ContextCache:
    def __init__(self, ttl_minutes: int = 30):
        self._store: dict[str, _Entry] = {}
        self._ttl = timedelta(minutes=ttl_minutes)

    def get(self, key: str) -> Optional[dict[str, str]]:
        entry = self._store.get(key)
        if entry is None:
            return None
        if datetime.now() - entry.created_at >= self._ttl:
            del self._store[key]
            return None
        return entry.files

    def set(self, key: str, files: dict[str, str]) -> None:
        self._store[key] = _Entry(files=files)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_cache.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/context_cache/cache.py backend/tests/test_cache.py
git commit -m "feat: add context cache module with TTL and tests"
```

---

## Task 4: Rate Limiter Module (TDD)

**Files:**
- Create: `backend/rate_limit/limiter.py`
- Create: `backend/tests/test_rate_limit.py`

- [ ] **Step 1: Write failing tests in `backend/tests/test_rate_limit.py`**

```python
import pytest
from rate_limit.limiter import RateLimiter


def test_first_request_is_allowed():
    limiter = RateLimiter(max_requests=20, window_hours=1)
    assert limiter.is_allowed("1.2.3.4") is True


def test_requests_up_to_limit_are_allowed():
    limiter = RateLimiter(max_requests=5, window_hours=1)
    ip = "10.0.0.1"
    for _ in range(5):
        assert limiter.is_allowed(ip) is True


def test_request_beyond_limit_is_rejected():
    limiter = RateLimiter(max_requests=5, window_hours=1)
    ip = "10.0.0.2"
    for _ in range(5):
        limiter.is_allowed(ip)
    assert limiter.is_allowed(ip) is False


def test_different_ips_are_independent():
    limiter = RateLimiter(max_requests=1, window_hours=1)
    assert limiter.is_allowed("192.168.1.1") is True
    assert limiter.is_allowed("192.168.1.2") is True  # different IP, not blocked


def test_limit_is_inclusive():
    """Exactly max_requests should be allowed; max_requests+1 should not."""
    limiter = RateLimiter(max_requests=3, window_hours=1)
    ip = "10.0.0.3"
    assert limiter.is_allowed(ip) is True   # 1
    assert limiter.is_allowed(ip) is True   # 2
    assert limiter.is_allowed(ip) is True   # 3
    assert limiter.is_allowed(ip) is False  # 4 - over limit
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_rate_limit.py -v
```

Expected: `ImportError: No module named 'rate_limit.limiter'`

- [ ] **Step 3: Implement `backend/rate_limit/limiter.py`**

```python
from collections import defaultdict
from datetime import datetime, timedelta


class RateLimiter:
    def __init__(self, max_requests: int = 20, window_hours: int = 1):
        self._requests: dict[str, list[datetime]] = defaultdict(list)
        self._max = max_requests
        self._window = timedelta(hours=window_hours)

    def is_allowed(self, ip: str) -> bool:
        now = datetime.now()
        cutoff = now - self._window
        # Prune expired timestamps
        self._requests[ip] = [t for t in self._requests[ip] if t > cutoff]
        if len(self._requests[ip]) >= self._max:
            return False
        self._requests[ip].append(now)
        return True
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_rate_limit.py -v
```

Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/rate_limit/limiter.py backend/tests/test_rate_limit.py
git commit -m "feat: add per-IP rate limiter with sliding window and tests"
```

---

## Task 5: GitHub Client

**Files:**
- Create: `backend/github/client.py`
- Create: `backend/tests/test_github.py`

- [ ] **Step 1: Implement `backend/github/client.py`**

```python
import base64
import os
import httpx
from typing import Optional


class GitHubError(Exception):
    """Raised for known GitHub API errors."""
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


class GitHubClient:
    BASE_URL = "https://api.github.com"

    def __init__(self, token: Optional[str] = None):
        self._token = token or os.getenv("GITHUB_TOKEN")
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        self._client = httpx.AsyncClient(headers=headers, timeout=15.0)

    async def get_file_tree(self, owner: str, repo: str) -> list[str]:
        """Return a flat list of all blob paths in the repo's default branch."""
        # Get default branch
        repo_resp = await self._client.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
        if repo_resp.status_code == 404:
            raise GitHubError(f"Repository {owner}/{repo} not found or is private.", 404)
        if repo_resp.status_code == 403:
            raise GitHubError("GitHub API rate limit exceeded. Try again later.", 503)
        repo_resp.raise_for_status()

        default_branch = repo_resp.json()["default_branch"]

        # Fetch recursive tree
        tree_resp = await self._client.get(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/{default_branch}",
            params={"recursive": "1"},
        )
        tree_resp.raise_for_status()

        data = tree_resp.json()
        # Only include blobs (files), not trees (directories)
        return [item["path"] for item in data.get("tree", []) if item["type"] == "blob"]

    async def get_file_contents(
        self, owner: str, repo: str, paths: list[str]
    ) -> dict[str, str]:
        """Fetch and decode content for each path. Skips files that fail."""
        results: dict[str, str] = {}
        for path in paths:
            resp = await self._client.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}"
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            if data.get("encoding") == "base64":
                try:
                    results[path] = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
                except Exception:
                    continue
        return results

    async def aclose(self):
        await self._client.aclose()
```

- [ ] **Step 2: Write integration test in `backend/tests/test_github.py`**

These tests hit the real GitHub API. They use `octocat/Hello-World` — a tiny, stable repo that GitHub maintains.

```python
import pytest
import pytest_asyncio
from github.client import GitHubClient


@pytest.fixture
async def client():
    c = GitHubClient()
    yield c
    await c.aclose()


@pytest.mark.asyncio
async def test_get_file_tree_returns_paths(client):
    tree = await client.get_file_tree("octocat", "Hello-World")
    assert isinstance(tree, list)
    assert len(tree) > 0
    assert all(isinstance(p, str) for p in tree)


@pytest.mark.asyncio
async def test_get_file_tree_nonexistent_repo_raises(client):
    from github.client import GitHubError
    with pytest.raises(GitHubError) as exc_info:
        await client.get_file_tree("octocat", "this-repo-does-not-exist-xyz")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_file_contents_returns_text(client):
    tree = await client.get_file_tree("octocat", "Hello-World")
    # Fetch just the first file
    contents = await client.get_file_contents("octocat", "Hello-World", tree[:1])
    assert len(contents) == 1
    path = tree[0]
    assert isinstance(contents[path], str)
```

- [ ] **Step 3: Add `asyncio_mode` config for pytest**

Create `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 4: Run integration tests**

```bash
pytest tests/test_github.py -v
```

Expected: All 3 tests PASS (requires internet + optional GITHUB_TOKEN in env)

- [ ] **Step 5: Commit**

```bash
git add backend/github/client.py backend/tests/test_github.py backend/pytest.ini
git commit -m "feat: add GitHub API client with integration tests"
```

---

## Task 6: LLM Streaming Module

**Files:**
- Create: `backend/llm/streaming.py`

Note: This module is not unit-tested in Phase 1 — it wraps an external API. Manual testing via the chat endpoint is sufficient.

- [ ] **Step 1: Implement `backend/llm/streaming.py`**

```python
import os
from typing import AsyncIterator
import anthropic


async def stream_chat(
    context_files: dict[str, str],
    question: str,
) -> AsyncIterator[str]:
    """
    Stream an LLM response about a repo.

    context_files: dict of {path: file_content}
    question: the user's question
    Yields text tokens as they arrive.
    """
    model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

    file_context = "\n\n".join(
        f"=== {path} ===\n{content}"
        for path, content in context_files.items()
    )

    system_prompt = (
        "You are an expert software engineer helping users understand open-source repositories. "
        "Answer questions clearly and concisely based on the provided source files. "
        "If the answer isn't evident from the files shown, say so — don't guess.\n\n"
        f"Repository files:\n\n{file_context}"
    )

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    async with client.messages.stream(
        model=model,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": question}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

- [ ] **Step 2: Commit**

```bash
git add backend/llm/streaming.py
git commit -m "feat: add LLM streaming module using Anthropic SDK"
```

---

## Task 7: FastAPI API Routes

**Files:**
- Create: `backend/api/repo.py`
- Create: `backend/api/chat.py`

These routes wire together the modules built in Tasks 2–6. A single shared `RateLimiter` and `ContextCache` instance lives in `main.py` and is passed to routes via FastAPI's dependency injection.

- [ ] **Step 1: Create `backend/state.py`**

Routers import singletons from here, not from `main.py`. This avoids the circular import that would occur if routers imported `main` while `main` imports the routers.

```python
import os
from context_cache.cache import ContextCache
from rate_limit.limiter import RateLimiter

context_cache = ContextCache(ttl_minutes=int(os.getenv("CONTEXT_CACHE_TTL_MINUTES", "30")))
rate_limiter = RateLimiter(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20")),
    window_hours=int(os.getenv("RATE_LIMIT_WINDOW_HOURS", "1")),
)
```

- [ ] **Step 2: Update `backend/main.py`**

```python
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.repo import router as repo_router
from api.chat import router as chat_router

load_dotenv()

app = FastAPI(title="AskAboutGit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "https://askaboutgit.guyregev.dev"),
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(repo_router, prefix="/api")
app.include_router(chat_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Create `backend/api/repo.py`**

```python
from fastapi import APIRouter, HTTPException
from github.client import GitHubClient, GitHubError
from selector.selector import select_files
import state

router = APIRouter()


@router.get("/repo/{owner}/{repo}")
async def load_repo(owner: str, repo: str):
    """
    Fetch the repo's file tree, select key files, fetch their contents,
    and store in the context cache. Returns 200 if ready.
    """
    cache_key = f"{owner}/{repo}"

    # Return immediately if already cached
    if state.context_cache.get(cache_key) is not None:
        return {"owner": owner, "repo": repo, "status": "ready"}

    client = GitHubClient()
    try:
        tree = await client.get_file_tree(owner, repo)
        selected_paths = select_files(tree)
        contents = await client.get_file_contents(owner, repo, selected_paths)
    except GitHubError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    finally:
        await client.aclose()

    if not contents:
        raise HTTPException(status_code=422, detail="Could not read any files from this repository.")

    state.context_cache.set(cache_key, contents)
    return {"owner": owner, "repo": repo, "status": "ready"}
```

- [ ] **Step 3: Create `backend/api/chat.py`**

```python
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


@router.post("/chat")
async def chat(body: ChatRequest, request: Request):
    ip = request.client.host if request.client else "unknown"

    if not state.rate_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=429,
            detail="You've reached the request limit. Try again in an hour.",
        )

    cache_key = f"{body.owner}/{body.repo}"
    context = state.context_cache.get(cache_key)
    if context is None:
        raise HTTPException(
            status_code=404,
            detail="Repo context not found. Reload the page and try again.",
        )

    async def generate():
        try:
            async for token in stream_chat(context, body.question):
                yield f"data: {token}\n\n"
        except Exception:
            yield "data: [ERROR]\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

- [ ] **Step 4: Smoke test the API manually**

```bash
cd backend
source venv/bin/activate
# Copy .env.example to .env and fill in your tokens
cp .env.example .env
# Edit .env with real GITHUB_TOKEN and ANTHROPIC_API_KEY
uvicorn main:app --reload
```

In a second terminal:
```bash
# Load a small repo
curl http://localhost:8000/api/repo/octocat/Hello-World
# Expected: {"owner":"octocat","repo":"Hello-World","status":"ready"}

# Ask a question (streaming)
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"owner":"octocat","repo":"Hello-World","question":"What is this repo?"}'
# Expected: stream of "data: ..." lines
```

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/api/repo.py backend/api/chat.py
git commit -m "feat: add repo and chat API routes"
```

---

## Task 8: Frontend Project Scaffold

**Files:**
- Create: `frontend/` (Vite scaffold)
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Scaffold Vite + React + TypeScript project**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Install Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

Replace `src/index.css` content:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npm install -D @types/node
npx shadcn@latest init
```

When prompted:
- Style: `Default`
- Base color: `Slate`
- CSS variables: `yes`

Then add the components we need:

```bash
npx shadcn@latest add button input card scroll-area
```

- [ ] **Step 4: Install React Router**

```bash
npm install react-router-dom
```

- [ ] **Step 5: Update `vite.config.ts` to proxy `/api` to backend in dev**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 6: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

- [ ] **Step 7: Create `src/App.tsx`**

The catch-all route handles `/:owner` (no repo) per the spec — redirects to `/` instead of silently matching nothing.

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ChatPage from './pages/ChatPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/:owner/:repo" element={<ChatPage />} />
      {/* Owner-only URL (no repo) → back to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts at `http://localhost:5173`

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold frontend with Vite, Tailwind, shadcn/ui, React Router"
```

---

## Task 9: Frontend API Client

**Files:**
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create `frontend/src/lib/api.ts`**

```ts
export async function loadRepo(owner: string, repo: string): Promise<void> {
  const res = await fetch(`/api/repo/${owner}/${repo}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Failed to load repository (${res.status})`)
  }
}

export async function streamChat(
  owner: string,
  repo: string,
  question: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, question }),
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
      const text = line.slice(6)
      if (text === '[DONE]') {
        onDone()
        return
      }
      if (text === '[ERROR]') {
        onError('The AI encountered an error. Please try again.')
        return
      }
      onToken(text)
    }
  }

  onDone()
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add frontend API client with SSE stream parsing"
```

---

## Task 10: Landing Page

**Files:**
- Create: `frontend/src/pages/LandingPage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/LandingPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LandingPage() {
  const [url, setUrl] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = url.match(/github\.com\/([^/]+)\/([^/\s]+)/)
    if (!match) return
    navigate(`/${match[1]}/${match[2]}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="max-w-xl w-full space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">AskAboutGit</h1>
          <p className="text-muted-foreground text-lg">
            Chat with any public GitHub repository. No setup required.
          </p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground bg-muted rounded-lg p-4 text-left">
          <p className="font-medium text-foreground">How it works:</p>
          <p>
            Take any GitHub URL and replace <code className="font-mono">github.com</code> with{' '}
            <code className="font-mono">askaboutgit.guyregev.dev</code>
          </p>
          <p className="font-mono text-xs bg-background rounded p-2">
            github.com/facebook/react →{' '}
            askaboutgit.guyregev.dev/facebook/react
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a GitHub URL..."
            className="flex-1"
          />
          <Button type="submit" disabled={!url.trim()}>
            Ask
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manually verify landing page**

```bash
cd frontend && npm run dev
```

Visit `http://localhost:5173`. Verify:
- Title and description render
- Pasting a GitHub URL and clicking Ask navigates to `/:owner/:repo`
- Invalid URLs (no `github.com`) do nothing

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LandingPage.tsx
git commit -m "feat: add landing page with GitHub URL input"
```

---

## Task 11: Chat Page and Components

**Files:**
- Create: `frontend/src/pages/ChatPage.tsx`
- Create: `frontend/src/components/MessageBubble.tsx`
- Create: `frontend/src/components/ChatWindow.tsx`
- Create: `frontend/src/components/ChatInput.tsx`

- [ ] **Step 1: Create `frontend/src/components/MessageBubble.tsx`**

```tsx
interface Props {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export default function MessageBubble({ role, content, streaming }: Props) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}
      >
        {content}
        {streaming && (
          <span className="inline-block w-1 h-3 ml-0.5 bg-current animate-pulse" />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/ChatWindow.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import MessageBubble from './MessageBubble'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface Props {
  messages: Message[]
}

export default function ChatWindow({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <ScrollArea className="flex-1 px-4 py-4">
      <div className="space-y-4 max-w-2xl mx-auto">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            streaming={msg.streaming}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/ChatInput.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  onSend: (question: string) => void
  disabled: boolean
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    if (!q || disabled) return
    onSend(q)
    setValue('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-background px-4 py-3"
    >
      <div className="max-w-2xl mx-auto flex gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask about this repository..."
          disabled={disabled}
          className="flex-1"
        />
        <Button type="submit" disabled={disabled || !value.trim()}>
          Send
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Create `frontend/src/pages/ChatPage.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadRepo, streamChat } from '@/lib/api'
import ChatWindow, { Message } from '@/components/ChatWindow'
import ChatInput from '@/components/ChatInput'

type PageState = 'loading' | 'ready' | 'error'

function generateId() {
  return Math.random().toString(36).slice(2)
}

export default function ChatPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)

  useEffect(() => {
    if (!owner || !repo) {
      navigate('/')
      return
    }

    loadRepo(owner, repo)
      .then(() => {
        setMessages([
          {
            id: generateId(),
            role: 'assistant',
            content: `Ask me anything about **${owner}/${repo}**.`,
          },
        ])
        setState('ready')
      })
      .catch((err: Error) => {
        setErrorMsg(err.message)
        setState('error')
      })
  }, [owner, repo, navigate])

  const handleSend = useCallback(
    (question: string) => {
      if (!owner || !repo || streaming) return

      const userMsg: Message = { id: generateId(), role: 'user', content: question }
      const assistantId = generateId()
      const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)

      streamChat(
        owner,
        repo,
        question,
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )
          )
        },
        () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
          )
          setStreaming(false)
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: errMsg, streaming: false }
                : m
            )
          )
          setStreaming(false)
        }
      )
    },
    [owner, repo, streaming]
  )

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading {owner}/{repo}…
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{errorMsg}</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-muted-foreground underline"
        >
          Try another repository
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b px-4 py-3 text-sm font-medium text-muted-foreground">
        <span className="text-foreground font-semibold">{owner}/{repo}</span>
        {' · '}
        <button onClick={() => navigate('/')} className="hover:underline">
          Change repo
        </button>
      </header>

      <ChatWindow messages={messages} />
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  )
}
```

- [ ] **Step 5: Manually test end-to-end in dev mode**

Make sure the backend is running (`uvicorn main:app --reload` in `backend/`).

```bash
cd frontend && npm run dev
```

Visit `http://localhost:5173`, paste `github.com/octocat/Hello-World`, click Ask.

Verify:
- Loading state appears
- Chat UI appears with welcome message
- Typing a question and sending shows the user message
- AI response streams in token by token
- Input is disabled while streaming, re-enabled after

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add chat page with streaming UI and message components"
```

---

## Task 12: Dockerfiles and Nginx Config

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `frontend/nginx.conf`**

Nginx serves the React build and proxies `/api/*` to the backend ClusterIP service. This keeps everything under one domain and avoids CORS.

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy API calls to the backend service (k8s internal DNS)
    location /api/ {
        proxy_pass http://askaboutgit-backend.askaboutgit.svc.cluster.local:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Required for SSE — disable buffering
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }

    # React Router — serve index.html for all non-asset routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 3: Create `frontend/Dockerfile`**

```dockerfile
# Stage 1: Build React app
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 4: Build and test both images locally**

```bash
# Backend
cd backend
docker build --platform linux/amd64 -t guyreg/askaboutgit-backend:latest .

# Frontend
cd ../frontend
docker build --platform linux/amd64 -t guyreg/askaboutgit-frontend:latest .
```

Expected: Both builds succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: add Dockerfiles and nginx config for production build"
```

---

## Task 13: Kubernetes Manifests and Deployment

**Files:**
- Create: `k8s/namespace.yaml`
- Create: `k8s/configmap.yaml`
- Create: `k8s/deployment.yaml`
- Create: `k8s/service.yaml`

- [ ] **Step 1: Create `k8s/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: askaboutgit
```

- [ ] **Step 2: Create `k8s/configmap.yaml`**

Non-secret environment variables for the backend.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: askaboutgit-config
  namespace: askaboutgit
data:
  LLM_MODEL: "claude-haiku-4-5-20251001"
  RATE_LIMIT_MAX_REQUESTS: "20"
  RATE_LIMIT_WINDOW_HOURS: "1"
  CONTEXT_CACHE_TTL_MINUTES: "30"
  FRONTEND_URL: "https://askaboutgit.guyregev.dev"
```

- [ ] **Step 3: Create `k8s/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: askaboutgit-frontend
  namespace: askaboutgit
spec:
  selector:
    app: askaboutgit-frontend
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: askaboutgit-backend
  namespace: askaboutgit
spec:
  selector:
    app: askaboutgit-backend
  ports:
    - port: 8000
      targetPort: 8000
```

- [ ] **Step 4: Create `k8s/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: askaboutgit-frontend
  namespace: askaboutgit
spec:
  replicas: 1
  selector:
    matchLabels:
      app: askaboutgit-frontend
  template:
    metadata:
      labels:
        app: askaboutgit-frontend
    spec:
      containers:
        - name: frontend
          image: guyreg/askaboutgit-frontend:latest
          ports:
            - containerPort: 80
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: askaboutgit-backend
  namespace: askaboutgit
spec:
  replicas: 1
  selector:
    matchLabels:
      app: askaboutgit-backend
  template:
    metadata:
      labels:
        app: askaboutgit-backend
    spec:
      containers:
        - name: backend
          image: guyreg/askaboutgit-backend:latest
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: askaboutgit-config
            - secretRef:
                name: askaboutgit-secrets
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

- [ ] **Step 5: Push Docker images to Docker Hub**

```bash
docker push guyreg/askaboutgit-frontend:latest
docker push guyreg/askaboutgit-backend:latest
```

- [ ] **Step 6: Apply manifests and create secrets on the cluster**

```bash
export KUBECONFIG=~/.kube/config-popos

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml

# Create secrets imperatively — never committed to git
kubectl create secret generic askaboutgit-secrets \
  -n askaboutgit \
  --from-literal=GITHUB_TOKEN=<your_token> \
  --from-literal=ANTHROPIC_API_KEY=<your_key>
```

- [ ] **Step 7: Verify pods are running**

```bash
kubectl get pods -n askaboutgit
```

Expected:
```
NAME                                     READY   STATUS    RESTARTS   AGE
askaboutgit-frontend-xxx                 1/1     Running   0          1m
askaboutgit-backend-xxx                  1/1     Running   0          1m
```

If a pod is not ready:
```bash
kubectl logs -n askaboutgit deployment/askaboutgit-backend
```

- [ ] **Step 8: Configure Cloudflare routing (in Cloudflare Dashboard)**

In the Cloudflare Zero Trust dashboard, add a public hostname to your existing tunnel:

- Subdomain: `askaboutgit`
- Domain: `guyregev.dev`
- Service: `http://askaboutgit-frontend.askaboutgit.svc.cluster.local:80`

(The backend is internal only — Nginx proxies `/api/*` to it, no separate Cloudflare route needed.)

- [ ] **Step 9: Smoke test production**

Visit `https://askaboutgit.guyregev.dev` — landing page should load.

Visit `https://askaboutgit.guyregev.dev/octocat/Hello-World` — loading state then chat UI should appear.

Ask a question — streaming response should render.

- [ ] **Step 10: Commit**

```bash
git add k8s/
git commit -m "feat: add k8s manifests for frontend and backend deployment"
```

---

## Done

Phase 1 is complete when:
- [ ] All unit tests pass (`pytest backend/tests/test_selector.py backend/tests/test_cache.py backend/tests/test_rate_limit.py`)
- [ ] GitHub integration tests pass (`pytest backend/tests/test_github.py`)
- [ ] `https://askaboutgit.guyregev.dev` loads the landing page
- [ ] Visiting `/octocat/Hello-World` loads the chat UI
- [ ] Asking a question streams a response
- [ ] A 21st question from the same IP returns a 429 error message
