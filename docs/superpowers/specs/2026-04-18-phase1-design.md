# AskAboutGit — Phase 1 Design Spec

**Date:** 2026-04-18
**Scope:** Phase 1 MVP (Free Tier Only)

---

## Overview

A web app that lets anyone chat with an AI about any public GitHub repository. The user replaces `github.com` in a repo URL with `askaboutgit.guyregev.dev` and lands in a clean chat interface.

**Example:** `github.com/facebook/react` → `askaboutgit.guyregev.dev/facebook/react`

Phase 1 covers: URL routing, repo context fetching via GitHub API, smart file selection, streaming chat UI, per-IP rate limiting, and deployment to the home k3s cluster.

---

## Repository Structure

Monorepo:

```
askaboutgit/
  frontend/           # React + Vite + Tailwind + shadcn/ui
  backend/            # FastAPI (Python)
    api/              # Route handlers only
    github/           # GitHub API client
    selector/         # Smart file selection logic
    llm/              # LLM abstraction + streaming
    context_cache/    # In-memory repo context cache (TTL-based)
    rate_limit/       # Per-IP rate limiting
  k8s/                # Kubernetes manifests
    namespace.yaml
    configmap.yaml
    deployment.yaml
    service.yaml
  docs/
    superpowers/
      specs/
```

---

## Architecture

### Frontend

**Stack:** React + Vite + Tailwind CSS + shadcn/ui

**Routes (React Router):**
- `/` — Landing page: brief product explanation and example URL to try
- `/:owner/:repo` — Chat page

**Chat page behavior:**
1. On mount, call `GET /api/repo/{owner}/{repo}` — show loading state
2. On success, show chat input and welcome message: *"Ask me anything about {owner}/{repo}"*
3. On error (repo not found, private, etc.), show a clear inline error message
4. Chat layout: message history scrolling above, input fixed at the bottom
5. Streaming response rendered token-by-token via the browser's native `EventSource` API
6. No file context panel — context fetching is internal and never exposed to the user

**shadcn/ui components used:** `ScrollArea`, `Input`, `Button`, `Card`

### Backend

**Stack:** Python + FastAPI

**API Routes:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repo/{owner}/{repo}` | Validate repo exists, fetch and select files |
| `POST` | `/api/chat` | Rate-check, build prompt, stream LLM response via SSE |

All errors return consistent JSON: `{"error": "human-readable message"}`

**Module responsibilities:**

#### `github/`
Thin client wrapping the GitHub REST API. Uses a GitHub token from environment config (authenticated: 5000 req/hr limit).

- Fetch full recursive file tree: `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`
- Fetch individual file contents
- Raises clear errors for: repo not found, private repo, API rate limit exceeded

#### `selector/`
Pure logic — no I/O. Takes a file tree as input, returns a prioritized list of up to ~10 file paths.

**Priority order:**
1. README (any variant)
2. Package/manifest files (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.)
3. Entry points (`main.py`, `index.ts`, `app.ts`, `server.py`, etc.)
4. Config files
5. Core modules (shortest paths, non-test, non-generated)

**Always skipped:** `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, test files, lock files, assets, generated code

#### `llm/`
Single function: `stream_chat(context_files, question)`.

- Builds prompt: system message containing selected file contents, user question
- Calls LLM API (Phase 1: single hardcoded cheap model — Gemini Flash or Claude Haiku)
- Yields SSE tokens back to the client
- The interface is designed to accept a provider parameter for Phase 2 BYOK, but this is not implemented in Phase 1

#### `context_cache/`
In-memory cache of selected file contents, keyed by `"{owner}/{repo}"`.

- Populated by `GET /api/repo/{owner}/{repo}` after files are fetched and selected
- Read by `POST /api/chat` to build the prompt — the frontend never sends file contents
- Simple dict with a TTL (30 minutes): entries expire and are re-fetched on next repo load
- No persistence needed for Phase 1

This keeps context fetching entirely server-side and never exposed to the client.

#### `rate_limit/`
In-memory sliding window per IP address.

- Tracks request timestamps in a dict keyed by IP
- Limit: 20 chat requests per IP per hour
- Returns `429` with a human-readable message when exceeded
- No Redis needed for Phase 1

---

## Data Flow

```
User visits askaboutgit.guyregev.dev/facebook/react
  → Frontend parses URL (owner=facebook, repo=react)
  → GET /api/repo/facebook/react
      → github/: fetch file tree
      → selector/: pick ~10 files
      → github/: fetch file contents
      → context_cache/: store contents keyed by owner/repo (TTL 30min)
      → return 200 (repo ready)
  → Frontend shows clean chat UI

User sends question
  → POST /api/chat {owner, repo, question}
      → rate_limit/: check IP
      → context_cache/: look up file contents by owner/repo
      → llm/: build prompt with file contents + question
      → llm/: call LLM API, stream tokens
  → SSE stream → Frontend renders tokens as they arrive
```

---

## Error Handling

| Condition | HTTP Status | Frontend behavior |
|-----------|-------------|-------------------|
| Repo not found / private | `404` | Inline error in chat area |
| GitHub API rate limit | `503` | "Try again later" message |
| LLM API failure | `502` | Generic error in chat area |
| Per-IP rate limit exceeded | `429` | "You've reached the request limit" message |
| URL with owner only (no repo) | — | Redirect to `/` with short explanation |

No silent failures. Every error path shows the user something meaningful.

---

## Testing

| Layer | Approach |
|-------|----------|
| `selector/` | Unit tests: given file tree input, assert correct files selected/skipped |
| `github/` | Integration tests against real GitHub API (small, stable public repo as fixture) |
| `rate_limit/` | Unit test: assert 21st request within an hour is rejected |
| Frontend | Manual browser testing for Phase 1 |

---

## Deployment

**Target:** Home k3s cluster (`pop-os`) via Cloudflare Zero Trust Tunnel

**Namespace:** `askaboutgit`

**Containers:**
- `guyreg/askaboutgit-frontend:latest` — Nginx serving React production build
- `guyreg/askaboutgit-backend:latest` — FastAPI (Uvicorn)

Both built with `--platform linux/amd64` from Apple Silicon Mac.

**Services:** ClusterIP only (no Ingress, no LoadBalancer, no NodePort)

**External routing (configured in Cloudflare Dashboard):**
- `askaboutgit.guyregev.dev` → `http://askaboutgit-frontend.askaboutgit.svc.cluster.local:80`
- `askaboutgit-api.guyregev.dev` → `http://askaboutgit-backend.askaboutgit.svc.cluster.local:8000`

**Secrets (created imperatively via kubectl, never committed):**
- `GITHUB_TOKEN` — GitHub personal access token
- `LLM_API_KEY` — API key for the free-tier LLM provider

**k8s manifest structure:**
```
k8s/
  namespace.yaml
  configmap.yaml      # non-secret env vars (LLM model name, rate limit config)
  deployment.yaml     # frontend + backend Deployments
  service.yaml        # two ClusterIP services
```

---

## Out of Scope for Phase 1

- RAG / vector embeddings (Phase 2)
- BYOK API key input (Phase 2)
- Agentic tool use (Phase 3)
- Private repo support via GitHub OAuth (Phase 4)
- Repo caching / persistence
- File context transparency panel
