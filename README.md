# AskAboutGit

Chat with any public GitHub repository. Paste a repo URL, get an AI that understands the codebase and answers questions about it — no cloning, no setup, no account required.

**Live at:** [askaboutgit.guyregev.dev](https://askaboutgit.guyregev.dev)

---

## How it works

1. You paste a GitHub URL (e.g. `github.com/facebook/react`)
2. The backend fetches the repo's file tree and selects the most relevant files (READMEs, entry points, manifests, config — up to 10 files)
3. Those files are loaded into the LLM's context and cached
4. You chat with an AI that's scoped exclusively to that repository — answers stream back in real time

---

## Stack

**Frontend**
- React 19 + TypeScript + Vite
- Tailwind CSS v4 (dark editorial design)
- `react-markdown` + `remark-gfm` for rendered AI responses

**Backend**
- FastAPI (Python)
- OpenAI API (`gpt-4o-mini` by default, configurable)
- GitHub REST API for file tree + content fetching
- In-memory context cache with TTL
- Per-IP rate limiting
- Server-sent events (SSE) for streaming

**Infrastructure**
- Kubernetes (k3s) with deployment manifests in `k8s/`
- Dockerfiles for both frontend and backend

---

## Running locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file:

```env
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...        # optional, raises GitHub rate limit
LLM_MODEL=gpt-4o-mini       # optional, defaults to gpt-4o-mini
FRONTEND_URL=http://localhost:5173
```

Start the server:

```bash
uvicorn main:app --reload
```

API runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`. The Vite dev server proxies `/api` to `localhost:8000`.

---

## Project structure

```
backend/
  api/           # FastAPI route handlers (repo loading, chat)
  context_cache/ # TTL-based in-memory cache for repo file contents
  github/        # GitHub API client
  llm/           # OpenAI streaming wrapper + system prompt
  rate_limit/    # Per-IP request limiter
  selector/      # File prioritization logic (picks top ~10 files from a repo)
  tests/         # pytest test suite

frontend/
  src/
    components/  # ChatWindow, MessageBubble, ChatInput
    pages/       # LandingPage, ChatPage
    lib/         # API client (loadRepo, streamChat)
    test/        # Vitest + Testing Library tests

k8s/             # Kubernetes manifests
```

---

## Tests

**Backend**
```bash
cd backend
source venv/bin/activate
pytest -v
```

**Frontend**
```bash
cd frontend
npm test
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `GITHUB_TOKEN` | No | — | GitHub personal access token (increases rate limit from 60 to 5000 req/hr) |
| `LLM_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `FRONTEND_URL` | No | `https://askaboutgit.guyregev.dev` | Allowed CORS origin |
