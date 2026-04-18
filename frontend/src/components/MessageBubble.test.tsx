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
