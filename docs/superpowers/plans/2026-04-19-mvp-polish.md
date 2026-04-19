# MVP Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "files loaded" badge with modal and a retry button to the chat page so the app is polished enough to share.

**Architecture:** Backend route returns `files` alongside the existing response; frontend stores the list in `ChatPage` state, renders a badge in the header that opens a `FilesModal`, and adds a "Try again" button to the error state using a `retryCount` dependency trick on the load `useEffect`.

**Tech Stack:** FastAPI (Python), React 19 + TypeScript, Vitest + Testing Library, pytest-asyncio

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/api/repo.py` | Add `files` key to both response paths |
| Create | `backend/tests/test_repo_route.py` | Route-level tests for the `files` field |
| Modify | `frontend/src/lib/api.ts` | `loadRepo` returns `Promise<string[]>` |
| Create | `frontend/src/test/api.test.ts` | Tests for updated `loadRepo` |
| Create | `frontend/src/components/FilesModal.tsx` | Modal that lists context files |
| Create | `frontend/src/test/FilesModal.test.tsx` | Tests for FilesModal |
| Modify | `frontend/src/pages/ChatPage.tsx` | Add files state, retry, badge, modal |
| Create | `frontend/src/test/ChatPage.test.tsx` | Tests for badge and retry |

---

## Task 1: Backend — extend repo route response

**Files:**
- Modify: `backend/api/repo.py`
- Create: `backend/tests/test_repo_route.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_repo_route.py`:

```python
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.repo import load_repo


async def test_cache_miss_returns_files():
    with (
        patch("api.repo.GitHubClient") as MockGH,
        patch("api.repo.select_files", return_value=["README.md", "package.json"]),
        patch("api.repo.state") as mock_state,
    ):
        mock_state.context_cache.get.return_value = None
        mock_state.context_cache.set = MagicMock()

        mock_gh = AsyncMock()
        mock_gh.get_file_tree.return_value = ["README.md", "package.json", "src/index.ts"]
        mock_gh.get_file_contents.return_value = {
            "README.md": "# Hello",
            "package.json": "{}",
        }
        mock_gh.aclose = AsyncMock()
        MockGH.return_value = mock_gh

        result = await load_repo("owner", "repo")

    assert "files" in result
    assert set(result["files"]) == {"README.md", "package.json"}


async def test_cache_hit_returns_files():
    with patch("api.repo.state") as mock_state:
        mock_state.context_cache.get.return_value = {
            "README.md": "# Hello",
            "src/index.ts": "export default {}",
        }

        result = await load_repo("owner", "repo")

    assert "files" in result
    assert set(result["files"]) == {"README.md", "src/index.ts"}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && source venv/bin/activate && pytest tests/test_repo_route.py -v
```

Expected: both tests fail with `KeyError: 'files'`

- [ ] **Step 3: Implement the change in `api/repo.py`**

Replace the entire file content:

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
    and store in the context cache. Returns 200 with file list if ready.
    """
    cache_key = f"{owner}/{repo}"

    context = state.context_cache.get(cache_key)
    if context is not None:
        return {"owner": owner, "repo": repo, "status": "ready", "files": list(context.keys())}

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
        raise HTTPException(
            status_code=422,
            detail="Could not read any files from this repository.",
        )

    state.context_cache.set(cache_key, contents)
    return {"owner": owner, "repo": repo, "status": "ready", "files": list(contents.keys())}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_repo_route.py -v
```

Expected: both tests PASS

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
pytest -v
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add api/repo.py tests/test_repo_route.py
git commit -m "feat: include file list in repo route response"
```

---

## Task 2: Frontend — `loadRepo` returns `string[]`

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/test/api.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/src/test/api.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRepo } from '../lib/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadRepo', () => {
  it('returns the files array from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            owner: 'facebook',
            repo: 'react',
            status: 'ready',
            files: ['README.md', 'package.json'],
          }),
      }),
    )

    const files = await loadRepo('facebook', 'react')
    expect(files).toEqual(['README.md', 'package.json'])
  })

  it('throws with the detail message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: 'Repository not found or is private.' }),
      }),
    )

    await expect(loadRepo('owner', 'repo')).rejects.toThrow(
      'Repository not found or is private.',
    )
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npm test -- api.test.ts
```

Expected: "returns the files array" fails — `loadRepo` currently returns `void`, not `string[]`

- [ ] **Step 3: Implement the change in `api.ts`**

Replace the `loadRepo` function:

```ts
export async function loadRepo(owner: string, repo: string): Promise<string[]> {
  const res = await fetch(`/api/repo/${owner}/${repo}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Failed to load repository (${res.status})`)
  }
  const data = await res.json()
  return data.files as string[]
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- api.test.ts
```

Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/lib/api.ts src/test/api.test.ts
git commit -m "feat: loadRepo returns file list from api response"
```

---

## Task 3: Frontend — `FilesModal` component

**Files:**
- Create: `frontend/src/components/FilesModal.tsx`
- Create: `frontend/src/test/FilesModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/test/FilesModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FilesModal from '../components/FilesModal'

describe('FilesModal', () => {
  it('renders all file paths', () => {
    render(
      <FilesModal
        files={['README.md', 'src/index.ts', 'package.json']}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('src/index.ts')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(<FilesModal files={['README.md']} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<FilesModal files={['README.md']} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('files-modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<FilesModal files={['README.md']} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- FilesModal.test.tsx
```

Expected: all tests fail — component does not exist

- [ ] **Step 3: Implement `FilesModal.tsx`**

Create `frontend/src/components/FilesModal.tsx`:

```tsx
import { useEffect } from 'react'

interface FilesModalProps {
  files: string[]
  onClose: () => void
}

export default function FilesModal({ files, onClose }: FilesModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="files-modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 50,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 51,
          background: 'var(--background, #0a0a0a)',
          border: '1px solid var(--border, #222)',
          borderRadius: '8px',
          width: 'min(480px, 90vw)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border, #222)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              fontWeight: 500,
            }}
          >
            Context files
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              fontSize: '18px',
              fontFamily: 'inherit',
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>

        {/* File list */}
        <ul
          style={{
            overflowY: 'auto',
            padding: '12px 18px',
            margin: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            flex: 1,
          }}
        >
          {files.map((path) => (
            <li
              key={path}
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                color: 'var(--foreground)',
                opacity: 0.85,
              }}
            >
              {path}
            </li>
          ))}
        </ul>

        {/* Footer */}
        <p
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            padding: '10px 18px',
            margin: 0,
            borderTop: '1px solid var(--border, #222)',
            flexShrink: 0,
          }}
        >
          These are the files the AI has access to for this repository.
        </p>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- FilesModal.test.tsx
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/components/FilesModal.tsx src/test/FilesModal.test.tsx
git commit -m "feat: add FilesModal component"
```

---

## Task 4: Frontend — ChatPage wiring

**Files:**
- Modify: `frontend/src/pages/ChatPage.tsx`
- Create: `frontend/src/test/ChatPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/test/ChatPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatPage from '../pages/ChatPage'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  loadRepo: vi.fn(),
  streamChat: vi.fn(),
}))

function renderChatPage() {
  return render(
    <MemoryRouter initialEntries={['/facebook/react']}>
      <Routes>
        <Route path="/:owner/:repo" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.mocked(api.loadRepo).mockReset()
    vi.mocked(api.streamChat).mockReset()
  })

  it('shows "Try again" button after a load failure', async () => {
    vi.mocked(api.loadRepo).mockRejectedValueOnce(new Error('Repo not found'))
    renderChatPage()
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
  })

  it('clicking "Try again" triggers a second load attempt', async () => {
    vi.mocked(api.loadRepo)
      .mockRejectedValueOnce(new Error('Repo not found'))
      .mockResolvedValueOnce(['README.md'])
    renderChatPage()
    await waitFor(() => screen.getByText('Try again'))
    fireEvent.click(screen.getByText('Try again'))
    await waitFor(() => expect(vi.mocked(api.loadRepo)).toHaveBeenCalledTimes(2))
  })

  it('shows "{n} files loaded" badge when ready', async () => {
    vi.mocked(api.loadRepo).mockResolvedValueOnce(['README.md', 'package.json'])
    renderChatPage()
    await waitFor(() =>
      expect(screen.getByText('2 files loaded')).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- ChatPage.test.tsx
```

Expected: all 3 tests fail

- [ ] **Step 3: Implement changes in `ChatPage.tsx`**

Replace the entire file:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadRepo, streamChat } from '@/lib/api'
import ChatWindow, { type Message } from '@/components/ChatWindow'
import ChatInput from '@/components/ChatInput'
import FilesModal from '@/components/FilesModal'

type PageState = 'loading' | 'ready' | 'error'

function generateId() {
  return Math.random().toString(36).slice(2)
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--green)',
            animation: 'blink 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function ChatPage() {
  const { owner: ownerParam, repo: repoParam } = useParams<{ owner: string; repo: string }>()
  const owner = ownerParam?.toLowerCase()
  const repo = repoParam?.toLowerCase()
  const navigate = useNavigate()

  const [state, setState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [showFiles, setShowFiles] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!owner || !repo) {
      navigate('/')
      return
    }

    setState('loading')
    setErrorMsg('')

    loadRepo(owner, repo)
      .then((fileList) => {
        setFiles(fileList)
        setMessages([
          {
            id: generateId(),
            role: 'assistant',
            content: `Ask me anything about ${owner}/${repo}.`,
          },
        ])
        setState('ready')
      })
      .catch((err: Error) => {
        setErrorMsg(err.message)
        setState('error')
      })
  }, [owner, repo, navigate, retryCount])

  const handleSend = useCallback(
    (question: string) => {
      if (!owner || !repo || streaming) return

      const userMsg: Message = { id: generateId(), role: 'user', content: question }
      const assistantId = generateId()
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)

      streamChat(
        owner,
        repo,
        question,
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m,
            ),
          )
        },
        () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
          )
          setStreaming(false)
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: errMsg, streaming: false } : m,
            ),
          )
          setStreaming(false)
        },
      )
    },
    [owner, repo, streaming],
  )

  if (state === 'loading') {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <LoadingDots />
        <p
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Loading {owner}/{repo}
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#ef4444', fontSize: '14px', maxWidth: '400px' }}>
          {errorMsg}
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => {
              setState('loading')
              setErrorMsg('')
              setRetryCount((c) => c + 1)
            }}
            style={{
              fontSize: '12px',
              color: 'var(--foreground)',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => navigate('/')}
            style={{
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              textDecorationColor: 'var(--border)',
              fontFamily: 'inherit',
            }}
          >
            Try another repository
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100svh' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          padding: '14px clamp(1.5rem, 8vw, 4rem)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              fontWeight: 500,
            }}
          >
            AskAboutGit
          </span>
          <span style={{ color: 'var(--border)', fontSize: '14px' }}>/</span>
          <span
            style={{
              fontSize: '13px',
              color: 'var(--foreground)',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            {owner}/{repo}
          </span>
          {streaming && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--green)',
                animation: 'blink 1s step-end infinite',
                flexShrink: 0,
              }}
            />
          )}
          <button
            onClick={() => setShowFiles(true)}
            style={{
              fontSize: '11px',
              color: 'var(--muted-foreground)',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {files.length} files loaded
          </button>
        </div>

        <button
          onClick={() => navigate('/')}
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.03em',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
        >
          ← change repo
        </button>
      </header>

      <ChatWindow messages={messages} />
      <ChatInput onSend={handleSend} disabled={streaming} />

      {showFiles && (
        <FilesModal files={files} onClose={() => setShowFiles(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- ChatPage.test.tsx
```

Expected: all 3 tests PASS

- [ ] **Step 5: Run full frontend test suite**

```bash
npm test
```

Expected: all tests PASS (existing MessageBubble tests + new api, FilesModal, ChatPage tests)

- [ ] **Step 6: Commit**

```bash
cd frontend
git add src/pages/ChatPage.tsx src/test/ChatPage.test.tsx
git commit -m "feat: add files badge, modal, and retry button to chat page"
```
