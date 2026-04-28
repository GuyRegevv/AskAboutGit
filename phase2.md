# Phase 2 — Deep Mode (RAG over a Single Repo)

## Goal

Add an opt-in "Deep mode" to AskAboutGit. When the user clicks it, the backend
indexes the repo's full source into a vector database and answers subsequent
questions via retrieval-augmented generation. Free-tier behavior (the existing
~10-file context-stuffed chat) remains unchanged and continues to be the
default first experience.

BYOK API-key input and the multi-provider LLM abstraction originally bundled
into Phase 2 are deferred to **Phase 2.5**. Agentic tool-use retrieval is
Phase 3 as in the original plan.

## Non-Goals (Deferred)

- BYOK API-key input (Phase 2.5)
- Multi-provider LLM abstraction beyond OpenAI (Phase 2.5)
- Hybrid BM25 + vector retrieval (Phase 2.5 if needed)
- Agentic tool use (`search_codebase`, `view_file_tree`, `read_file`) (Phase 3)
- LRU / disk-pressure eviction beyond TTL (added when first needed)
- Private repo support / GitHub OAuth

---

## User Flow

1. User navigates to `/:owner/:repo`. Free-tier chat loads and works
   immediately (unchanged).
2. A **"Deep mode"** button is visible in the chat UI.
3. On click, the frontend opens an SSE connection to the indexing endpoint.
   Phased progress is rendered live:
   - `downloading` — fetching repo tarball
   - `extracting` — unpacking to temp dir
   - `selecting` — walking files, applying skip-list, enforcing size cap
   - `chunking N files` — running AST-aware splitter
   - `embedding K/M` — batching chunks through OpenAI embeddings
   - `ready` — collection is queryable
4. Once `ready`, the chat switches to Deep mode and all subsequent messages
   use RAG-backed retrieval. The mode persists for the session.
5. If the repo exceeds the file-count cap, the indexing stream emits
   `too_large` with the count and the limit. Free-tier chat remains usable.
6. On any visit afterward, if a non-expired collection for the repo exists,
   clicking "Deep mode" returns `ready` immediately (no re-indexing).

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Indexing trigger | Explicit user action ("Deep mode" button) | Makes the RAG capability visible and demoable; preserves zero-friction first impression |
| Vector DB topology | In-process ChromaDB inside the existing FastAPI pod, backed by a PVC | Minimum infrastructure; trivially migratable to a separate deployment later |
| Chunking | `llama-index` or `langchain` code splitters (tree-sitter under the hood) | AST-aware quality without writing per-language parser glue |
| Embedding model | OpenAI `text-embedding-3-small` behind an `Embedder` Protocol | Best quality/effort, near-zero cost, no model hosting; abstraction allows swap to local model later |
| Retrieval | Vector top-k **plus** always-include the free-tier high-priority files | Cheap insurance against retrieval misses on high-level questions |
| Cache lifecycle | TTL (mirroring the existing `context_cache` shape) | Simple, predictable disk usage, acceptable cost on re-index for portfolio scope |
| Repo source | GitHub tarball endpoint (`/repos/{owner}/{repo}/tarball`) | Single network call, one rate-limit token, no `git` binary in image |
| Repo size guard | Hard cap on source-file count (post-skip-list); reject Deep mode above it | Honest UX, protects the home server, free tier still works |
| Progress UX | Phased SSE stream | Visually demonstrates the pipeline; reuses existing SSE pattern |

---

## Backend

### New Modules

```
backend/
  indexer/
    __init__.py
    tarball.py        # download + extract + walk + skip-list + size cap
    chunker.py        # AST-aware chunking via llama-index/langchain splitters
    embedder.py       # Embedder Protocol + OpenAIEmbedder implementation
    pipeline.py       # async orchestrator yielding progress events
  vectorstore/
    __init__.py
    chroma.py         # PersistentClient wrapper, collection per owner/repo
  api/
    index.py          # POST /api/index/:owner/:repo (SSE)
```

### Module Responsibilities

**`indexer/tarball.py`** — async function `fetch_and_extract(owner, repo)`
that calls the GitHub tarball API, streams the response into a temp dir,
unpacks it, walks the filesystem, applies the existing
`selector` skip-list (tests, lock files, binaries, vendored dirs, etc.),
enforces the file-count cap, and returns a list of `(path, content)` pairs
plus repo metadata (default-branch SHA, total file count).

**`indexer/chunker.py`** — given a list of `(path, content)` pairs, dispatches
to the appropriate code splitter by file extension and returns a flat list
of `Chunk(text, metadata)` objects. Metadata includes `file_path`,
`start_line`, `end_line`, `language`. Falls back to line-window splitting
for files the splitter doesn't recognize.

**`indexer/embedder.py`** — defines:

```python
class Embedder(Protocol):
    async def embed_batch(self, texts: list[str]) -> list[list[float]]: ...
```

with one implementation, `OpenAIEmbedder`, wrapping the existing OpenAI
client and `text-embedding-3-small`. Batches chunks to respect the
embedding API's batch size limits.

**`indexer/pipeline.py`** — async generator
`run_indexing(owner, repo) -> AsyncIterator[ProgressEvent]` that orchestrates
the stages above. Each stage yields a typed `ProgressEvent` consumed by the
SSE route. On success, the final event is `ready` with the collection name;
on failure, `failed` with a sanitized error message.

**`vectorstore/chroma.py`** — wraps `chromadb.PersistentClient(path=...)`
pointed at the PVC mount (`/data/chroma`). Exposes:

- `get_or_create_collection(owner, repo) -> Collection`
- `upsert_chunks(collection, chunks, embeddings)`
- `query(collection, query_embedding, k=8) -> list[Chunk]`
- `delete_collection(owner, repo)` (used by TTL eviction)

Collection name format: `{owner}__{repo}`. Collection metadata stores
`indexed_at` timestamp for TTL checks.

**`api/index.py`** — `POST /api/index/:owner/:repo` route that:

1. Acquires a per-`owner/repo` async lock so concurrent indexing requests
   for the same repo coalesce.
2. Checks for an existing non-expired Chroma collection. If found, emits
   `ready` and returns.
3. Otherwise iterates `pipeline.run_indexing(...)` and forwards each event
   as an SSE message.

### Modified Modules

**`api/chat.py`** — extends the chat request schema with
`mode: Literal["free", "deep"] = "free"`. In `deep` mode:

1. Verify a `ready` collection exists for the repo; if not, return an error
   directing the user to run indexing first.
2. Embed the user's latest question via the same `Embedder`.
3. Query Chroma for top-k chunks (k tuned, start at 8).
4. Build the LLM prompt by concatenating: (a) the existing free-tier
   high-priority files (READMEs, manifests, entry points) and (b) the
   retrieved chunks with their `file_path` and line range as headers.
5. Stream the response as today.

**`state.py`** — registers the singleton ChromaDB client and a TTL eviction
helper invoked on collection access.

**Rate limiting** — Indexing is gated by a separate, stricter rate limit
(per-IP, e.g. 1 indexing job per minute) layered on top of the existing
chat rate limiter, since indexing is the expensive operation.

### Configuration

New optional environment variables:

```
CHROMA_PERSIST_DIR=/data/chroma
EMBEDDING_MODEL=text-embedding-3-small
DEEP_MODE_FILE_CAP=1500
DEEP_MODE_TTL_SECONDS=86400          # 24h default
DEEP_MODE_TOP_K=8
INDEXING_RATE_LIMIT_PER_MINUTE=1
```

### Dependencies (added to `requirements.txt`)

- `chromadb`
- `llama-index-core` (or `langchain-text-splitters`) — chunking library, decided at implementation time based on which has cleaner code-splitter ergonomics
- `tree-sitter` and the relevant language grammars (transitively, via the chunking library)

---

## Frontend

### State Additions

`ChatPage.tsx` adds:

```ts
type DeepModeState =
  | { kind: "idle" }
  | { kind: "indexing"; phase: string; progress?: { current: number; total: number } }
  | { kind: "ready" }
  | { kind: "failed"; message: string }
  | { kind: "too_large"; count: number; limit: number };

const [mode, setMode] = useState<"free" | "deep">("free");
const [deepState, setDeepState] = useState<DeepModeState>({ kind: "idle" });
```

When the user sends a chat message, `streamChat` is called with the
current `mode`.

### New Component

**`DeepModeBanner.tsx`** — single component that renders the entire Deep
mode UI based on `deepState`:

- `idle` → button "Enable Deep mode (full-repo RAG)"
- `indexing` → live phase label + progress bar/counter
- `ready` → small confirmation badge "Deep mode active — answers use full repo context"
- `failed` → error message + retry button
- `too_large` → "This repo has N files. Deep mode is capped at M. Standard chat is still available."

### `api.ts` Additions

- `streamIndex(owner, repo, onEvent)` — mirrors the existing `streamChat`
  SSE reader pattern, parses progress events into typed objects.
- `streamChat` gains a `mode` parameter forwarded in the POST body.

---

## Infrastructure

- `backend/Dockerfile` — install new Python dependencies; no system packages
  needed (no `git` binary, since we use the tarball endpoint).
- `k8s/` — add a `PersistentVolumeClaim` for `/data/chroma`; mount it on
  the backend deployment. Size estimate: 5–10 GB initial; revisit when first
  full.
- `nginx.conf` (frontend) and the FastAPI route — confirm SSE buffering is
  disabled for the new `/api/index/...` route as it is for the chat route.

---

## Testing

### Backend Unit Tests

- `test_tarball.py` — mock `httpx`, verify extraction, skip-list application,
  file-count cap enforcement.
- `test_chunker.py` — feed in fixtures for Python, TypeScript, and an
  unsupported language; verify chunk boundaries and metadata.
- `test_embedder.py` — `FakeEmbedder` returning deterministic vectors;
  verify batching logic in `OpenAIEmbedder` against a mocked client.
- `test_chroma.py` — temp persist dir; verify upsert + query round-trip.
- `test_pipeline.py` — wire the modules together with fakes; verify the
  sequence of progress events emitted.

### Backend Integration Test

One end-to-end test against a small pinned fixture repo (either a checked-in
tarball fixture or a tiny stable public repo) that runs the full indexing
pipeline with a fake embedder and a real Chroma in a temp dir, then runs a
sample query and asserts retrieval returns expected chunks.

### Frontend Tests (Vitest)

- `streamIndex` SSE parser — feeds a synthetic stream and asserts the
  emitted event sequence.
- `DeepModeBanner` — render each `DeepModeState` variant, verify the
  expected UI elements appear.
- `ChatPage` — verify `mode` is forwarded to `streamChat`.

---

## Open Questions / Risks

- **Chunking library choice** (`llama-index` vs `langchain`) — to be made
  during implementation based on import surface, dependency footprint, and
  splitter ergonomics. Both are viable.
- **Retrieval quality without BM25** — pure vector search may underperform
  on lexical queries (the "rate limiting in throttle.ts" failure mode).
  Mitigation in v1 is the always-include high-priority files. If quality is
  visibly poor on demo repos, hybrid BM25 moves up to Phase 2.5.
- **Cold-start indexing time on the home-server CPU** — embedding latency
  is dominated by network round-trips to OpenAI, but chunking large repos
  may be CPU-heavy. Worth measuring on a few real repos and tuning the
  file cap accordingly.
- **PVC size** — 5–10 GB should hold many small/medium repo collections
  with TTL eviction, but no rigorous estimate exists. Monitor and grow.

---

## Phase Boundaries

- **Phase 2 (this doc):** Deep mode end-to-end, single-repo RAG with
  OpenAI embeddings + OpenAI LLM, in-process ChromaDB, TTL eviction,
  phased SSE progress UI, hard file-count cap.
- **Phase 2.5:** BYOK input + `LLM` interface with OpenAI/Anthropic/Google
  implementations. Optionally, hybrid BM25 retrieval and a swap to a local
  embedder if there's a portfolio reason to self-host.
- **Phase 3:** Replace static top-k retrieval with agentic tool use —
  the LLM gets `search_codebase`, `view_file_tree`, `read_file` tools and
  decides what to fetch.
