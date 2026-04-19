# MVP Polish: File Context Panel + Retry Button

**Date:** 2026-04-19
**Scope:** Two UX improvements to finalize Phase 1 before Phase 2 work begins

---

## Goal

Make the app polished enough to share publicly:

1. **File context panel** — users can see which files the AI has loaded as context
2. **Retry button** — users can recover from a repo load failure without refreshing the page

---

## Backend Change

### `GET /api/repo/{owner}/{repo}` — extend response

Add a `files` field to the existing response body. No new endpoints, no cache schema changes.

**Current response:**
```json
{ "owner": "...", "repo": "...", "status": "ready" }
```

**New response:**
```json
{ "owner": "...", "repo": "...", "status": "ready", "files": ["README.md", "package.json", ...] }
```

**Implementation in `api/repo.py`:**

- **Cache miss path:** after fetching content, include `"files": list(contents.keys())` in the return dict. `contents` is already filtered to only successfully-fetched files, so the keys are the correct list.
- **Cache hit path:** include `"files": list(context.keys())` — the cache stores `{path: content}`, so keys are the file list.

No changes to the cache module, selector, or GitHub client.

---

## Frontend Changes

### 1. `lib/api.ts` — `loadRepo` returns file list

Change signature from `Promise<void>` to `Promise<string[]>`. Parse `files` from the JSON response and return it.

```ts
export async function loadRepo(owner: string, repo: string): Promise<string[]>
```

### 2. `ChatPage.tsx` — state and retry

Add two new state variables:
- `files: string[]` — populated from `loadRepo` response, passed to `FilesModal`
- `showFiles: boolean` — controls modal visibility

Add retry mechanism:
- `retryCount: number` state variable, initially `0`
- Include `retryCount` in the `useEffect` dependency array so incrementing it re-triggers the load
- The error state renders a "Try again" button that calls `setState('loading')`, `setErrorMsg('')`, and `setRetryCount(c => c + 1)`

The existing "Try another repository" button (navigates back to `/`) is kept alongside the new "Try again" button.

### 3. Header badge

Inside the existing header in `ChatPage.tsx`, add a button immediately after the `owner/repo` text and streaming indicator:

- Label: `"{n} files loaded"` where `n = files.length`
- Style: consistent with other header text — small, muted, uppercase, monospace-feel. A subtle underline or opacity shift on hover.
- Only rendered when `state === 'ready'` (hidden during loading/error)
- `onClick`: sets `showFiles(true)`

### 4. `FilesModal.tsx` — new component

A focused, single-purpose component. Props: `files: string[]`, `onClose: () => void`.

**Structure:**
- Fixed-position full-screen backdrop (`rgba(0,0,0,0.6)`), click to close
- Centered panel (max-width ~480px), dark background matching the site theme
- Header: `"Context files"` label + `×` close button
- Body: scrollable list of file paths in monospace, one per line
- Footer note (small, muted): `"These are the files the AI has access to for this repository."`

**No third-party modal library.** Uses a fixed-position div with `z-index` above the chat. Escape key closes it (keydown listener added/removed on mount/unmount).

---

## What Is Not Changing

- Cache module, rate limiter, selector, GitHub client — untouched
- LLM streaming — untouched
- Landing page — untouched
- Overall page layout and styling system — untouched
- All existing tests remain valid; new tests cover the extended API response and FilesModal

---

## Testing

**Backend:**
- Update existing repo route tests to assert `files` is present in the response and is a non-empty list of strings
- Assert cache-hit path also returns `files`

**Frontend:**
- `FilesModal`: renders file list, calls `onClose` on backdrop click and `×` button, closes on Escape key
- `ChatPage` retry: after simulated load failure, clicking "Try again" resets to loading state and re-calls `loadRepo`
- `loadRepo` in `api.ts`: returns the `files` array from response
