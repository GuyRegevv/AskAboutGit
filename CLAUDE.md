# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

AskAboutGit lets users chat with any public GitHub repository. Navigate to `/:owner/:repo` and the backend fetches the repo's file tree, selects up to 10 high-priority files (READMEs, entry points, manifests), loads them into LLM context, and streams answers via SSE. Live at [askaboutgit.guyregev.dev](https://askaboutgit.guyregev.dev).

## Commands

### Backend (run from `backend/`)
```bash
source venv/bin/activate
uvicorn main:app --reload      # dev server at localhost:8000
pytest -v                      # all tests
pytest tests/test_selector.py  # single test file
```

### Frontend (run from `frontend/`)
```bash
npm run dev     # dev server at localhost:5173 (proxies /api → localhost:8000)
npm test        # Vitest test suite
npm run build   # TypeScript compile + Vite build
npm run lint    # ESLint
```

### Backend `.env` (required)
```
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...        # optional, raises GitHub rate limit from 60 to 5000/hr
LLM_MODEL=gpt-4o-mini       # optional default
FRONTEND_URL=http://localhost:5173
```

## Architecture

### Request Flow
1. Frontend `GET /api/repo/:owner/:repo` → backend fetches GitHub file tree, runs `selector.select_files()` to pick top ~10 paths by priority score, fetches their content via GitHub API, stores in `state.context_cache` (TTL-based, keyed by `owner/repo`)
2. Frontend `POST /api/chat` → backend retrieves cached context, streams LLM response via SSE. Newlines in tokens are encoded as `\n` to preserve SSE framing, decoded back in `frontend/src/lib/api.ts:streamChat`
3. Per-IP rate limiting enforced in `state.rate_limiter` before every chat request

### Backend Modules
- `main.py` — FastAPI app with CORS; mounts `api/repo` and `api/chat` routers
- `api/` — route handlers only; orchestration logic delegated to other modules
- `github/client.py` — async httpx client wrapping GitHub REST API (file tree + content fetch)
- `selector/selector.py` — scores and ranks file paths; READMEs (100) > manifests (90) > entry points (80) > configs (70) > other (depth-penalized). Skips tests, lock files, binaries, vendored dirs
- `llm/streaming.py` — wraps OpenAI async streaming; builds system prompt with full file context injected; `LLM_MODEL` env var controls model
- `context_cache/` and `rate_limit/` — in-memory stores initialized as module-level singletons in `state.py`

### Frontend Structure
- `src/lib/api.ts` — two functions: `loadRepo` (GET) and `streamChat` (POST → SSE reader loop)
- `src/pages/ChatPage.tsx` — owns all chat state (messages, streaming flag, page state); calls `loadRepo` on mount, `streamChat` on send
- `src/pages/LandingPage.tsx` — URL input/parsing, navigates to `/:owner/:repo`
- `src/components/` — `ChatWindow`, `MessageBubble` (renders markdown via `react-markdown`), `ChatInput`
- `@/` alias maps to `src/`; Tailwind v4 via Vite plugin; dark editorial design with Oxanium + Geist fonts

### Infrastructure
- Dockerfiles at `backend/Dockerfile` and `frontend/Dockerfile`
- Kubernetes manifests in `k8s/`
- Frontend served by nginx in production (`frontend/nginx.conf`)
