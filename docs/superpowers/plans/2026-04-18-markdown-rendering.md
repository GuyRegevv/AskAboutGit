# Markdown Rendering in Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw text rendering in assistant chat bubbles with react-markdown so bold, code blocks, lists, and other markdown elements render as formatted HTML.

**Architecture:** `MessageBubble.tsx` currently renders `{content}` as a plain string inside the assistant bubble. We wrap it in `<ReactMarkdown>` with `remark-gfm` for GitHub-flavored extras (tables, strikethrough). A `.prose-dark` CSS class in `index.css` styles all generated HTML elements to match the existing dark theme. User bubbles stay as plain text. Vitest + @testing-library/react provide component-level tests.

**Tech Stack:** react-markdown v9, remark-gfm v4, vitest, @testing-library/react, @testing-library/jest-dom, jsdom

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/vite.config.ts` | Modify | Add vitest `test` block (jsdom environment, globals, setup file) |
| `frontend/tsconfig.app.json` | Modify | Add `vitest/globals` to `types` array |
| `frontend/package.json` | Modify | Add `"test"` script |
| `frontend/src/test/setup.ts` | Create | Import `@testing-library/jest-dom` matchers |
| `frontend/src/components/MessageBubble.test.tsx` | Create | Vitest tests for markdown rendering |
| `frontend/src/components/MessageBubble.tsx` | Modify | Replace `{content}` with `<ReactMarkdown>` for assistant messages; remove `whiteSpace: 'pre-wrap'` |
| `frontend/src/index.css` | Modify | Add `.prose-dark` styles for all markdown HTML elements |

---

### Task 1: Set Up Vitest Test Infrastructure

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Modify: `frontend/package.json`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd /Users/guyreg/Coding/AskAboutGit/frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add test script to package.json**

Open `frontend/package.json`. In `"scripts"`, add `"test"` after `"lint"`:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "test": "vitest run",
  "preview": "vite preview"
},
```

- [ ] **Step 3: Update vite.config.ts to add vitest config**

Replace the full contents of `frontend/vite.config.ts` with:

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 4: Add vitest/globals to tsconfig.app.json**

In `frontend/tsconfig.app.json`, change the `types` array:

```json
"types": ["vite/client", "vitest/globals"],
```

- [ ] **Step 5: Create the test setup file**

Create `frontend/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Verify the test infrastructure works with a smoke test**

```bash
cd /Users/guyreg/Coding/AskAboutGit/frontend
npx vitest run --reporter=verbose 2>&1 | head -20
```

Expected: `No test files found` or similar — no errors, just no tests yet. If you see configuration errors, check that all packages installed correctly.

- [ ] **Step 7: Commit**

```bash
git add frontend/vite.config.ts frontend/tsconfig.app.json frontend/package.json frontend/package-lock.json frontend/src/test/setup.ts
git commit -m "test: set up vitest + testing-library for frontend components"
```

---

### Task 2: Write Failing Tests for Markdown Rendering

**Files:**
- Create: `frontend/src/components/MessageBubble.test.tsx`

- [ ] **Step 1: Create the test file**

Create `frontend/src/components/MessageBubble.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import MessageBubble from './MessageBubble'

describe('MessageBubble — assistant markdown rendering', () => {
  test('renders bold markdown as <strong>, not raw asterisks', () => {
    render(<MessageBubble role="assistant" content="This is **bold** text" />)
    expect(document.querySelector('strong')).toBeInTheDocument()
    expect(document.querySelector('strong')?.textContent).toBe('bold')
    expect(screen.queryByText(/\*\*bold\*\*/)).not.toBeInTheDocument()
  })

  test('renders inline code as <code>', () => {
    render(<MessageBubble role="assistant" content="Use `console.log()` here" />)
    expect(document.querySelector('code')).toBeInTheDocument()
    expect(document.querySelector('code')?.textContent).toBe('console.log()')
  })

  test('renders unordered list items as <li> elements', () => {
    render(
      <MessageBubble
        role="assistant"
        content={"- item one\n- item two\n- item three"}
      />
    )
    const items = document.querySelectorAll('li')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe('item one')
    expect(items[2].textContent).toBe('item three')
  })

  test('renders fenced code block as <pre><code>', () => {
    render(
      <MessageBubble
        role="assistant"
        content={"```python\nprint('hello')\n```"}
      />
    )
    expect(document.querySelector('pre')).toBeInTheDocument()
    expect(document.querySelector('pre code')).toBeInTheDocument()
  })
})

describe('MessageBubble — user messages stay as plain text', () => {
  test('user bubble renders raw text without parsing markdown', () => {
    render(<MessageBubble role="user" content="This is **not bold**" />)
    expect(screen.getByText('This is **not bold**')).toBeInTheDocument()
    expect(document.querySelector('strong')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
cd /Users/guyreg/Coding/AskAboutGit/frontend
npx vitest run --reporter=verbose
```

Expected: 5 tests, all FAIL with errors like "expected null not to be null" (no `<strong>` found) and "expected element to be in the document" (no `<code>` found).

- [ ] **Step 3: Commit the failing tests**

```bash
git add frontend/src/components/MessageBubble.test.tsx
git commit -m "test: add failing tests for markdown rendering in MessageBubble"
```

---

### Task 3: Implement ReactMarkdown in MessageBubble

**Files:**
- Modify: `frontend/src/components/MessageBubble.tsx`

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
cd /Users/guyreg/Coding/AskAboutGit/frontend
npm install react-markdown remark-gfm
```

Expected: both packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Replace the assistant bubble's content rendering**

Replace the full contents of `frontend/src/components/MessageBubble.tsx` with:

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export default function MessageBubble({ role, content, streaming }: Props) {
  if (role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <div
          style={{
            background: '#1a1a1a',
            color: 'var(--foreground)',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '13.5px',
            maxWidth: '72%',
            lineHeight: 1.55,
            fontWeight: 400,
            letterSpacing: '0.005em',
            border: '1px solid var(--border)',
          }}
        >
          {content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        className="prose-dark"
        style={{
          background: '#1a1a1a',
          color: 'var(--foreground)',
          borderRadius: '6px',
          padding: '8px 14px',
          fontSize: '13.5px',
          lineHeight: 1.55,
          fontWeight: 400,
          letterSpacing: '0.005em',
          border: '1px solid var(--green)',
          wordBreak: 'break-word',
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        {streaming && <span className="cursor-blink" />}
      </div>
    </div>
  )
}
```

Note: `whiteSpace: 'pre-wrap'` is removed — ReactMarkdown handles whitespace/newlines itself. `className="prose-dark"` is added for the CSS styles defined in the next task.

- [ ] **Step 3: Run the tests — expect all 5 to pass**

```bash
cd /Users/guyreg/Coding/AskAboutGit/frontend
npx vitest run --reporter=verbose
```

Expected:
```
✓ MessageBubble — assistant markdown rendering > renders bold markdown as <strong>
✓ MessageBubble — assistant markdown rendering > renders inline code as <code>
✓ MessageBubble — assistant markdown rendering > renders unordered list items as <li> elements
✓ MessageBubble — assistant markdown rendering > renders fenced code block as <pre><code>
✓ MessageBubble — user messages stay as plain text > user bubble renders raw text
5 passed
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MessageBubble.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: render assistant messages as markdown using react-markdown"
```

---

### Task 4: Style Markdown Output for Dark Theme

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add .prose-dark styles to the end of index.css**

Append to `frontend/src/index.css`:

```css
/* Markdown prose styles for assistant chat bubbles */
.prose-dark p { margin-bottom: 0.75rem; }
.prose-dark p:last-child { margin-bottom: 0; }

.prose-dark strong { font-weight: 600; color: #f0f0f0; }
.prose-dark em { font-style: italic; }

.prose-dark code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  padding: 0.1em 0.35em;
  font-size: 0.875em;
  color: var(--green);
}

.prose-dark pre {
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  overflow-x: auto;
}
.prose-dark pre code {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.8em;
  color: #d4d4d4;
}

.prose-dark ul,
.prose-dark ol {
  margin: 0.5rem 0 0.75rem 1.25rem;
}
.prose-dark ul { list-style-type: disc; }
.prose-dark ol { list-style-type: decimal; }
.prose-dark li { margin-bottom: 0.25rem; }

.prose-dark h1,
.prose-dark h2,
.prose-dark h3,
.prose-dark h4 {
  font-weight: 600;
  color: #f0f0f0;
  margin: 1rem 0 0.5rem;
  line-height: 1.3;
}
.prose-dark h1 { font-size: 1.25em; }
.prose-dark h2 { font-size: 1.1em; }
.prose-dark h3 { font-size: 1em; }
.prose-dark h4 { font-size: 0.95em; }

.prose-dark a {
  color: var(--green);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.prose-dark blockquote {
  border-left: 2px solid #333;
  padding-left: 0.75rem;
  color: #888;
  margin: 0.5rem 0;
  font-style: italic;
}

.prose-dark table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.875em;
}
.prose-dark th,
.prose-dark td {
  border: 1px solid #2a2a2a;
  padding: 0.4rem 0.75rem;
  text-align: left;
}
.prose-dark th {
  background: #111;
  font-weight: 600;
  color: #f0f0f0;
}

.prose-dark hr {
  border: none;
  border-top: 1px solid #2a2a2a;
  margin: 1rem 0;
}
```

- [ ] **Step 2: Verify tests still pass**

```bash
cd /Users/guyreg/Coding/AskAboutGit/frontend
npx vitest run --reporter=verbose
```

Expected: 5 passed (CSS changes don't affect the DOM tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: add prose-dark CSS for markdown-rendered assistant messages"
```
