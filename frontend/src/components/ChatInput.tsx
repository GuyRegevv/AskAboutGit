import { useState, useRef, useEffect } from 'react'

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

  const canSend = !disabled && value.trim().length > 0

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--background)',
        padding: 'clamp(1rem, 3vw, 1.5rem) clamp(1.5rem, 8vw, 4rem)',
      }}
    >
      <div
        style={{
          maxWidth: '680px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={disabled ? 'Thinking…' : 'Ask anything about this repository…'}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: disabled ? 'var(--muted-foreground)' : 'var(--foreground)',
            fontSize: '14px',
            fontFamily: 'inherit',
            fontWeight: 400,
            caretColor: 'var(--green)',
            letterSpacing: '0.01em',
          }}
        />

        <button
          type="submit"
          disabled={!canSend}
          style={{
            background: canSend ? 'var(--green)' : 'transparent',
            color: canSend ? '#0a0a0a' : 'var(--muted-foreground)',
            border: canSend ? 'none' : '1px solid var(--border)',
            borderRadius: '4px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'default',
            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            flexShrink: 0,
          }}
          aria-label="Send"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </form>
  )
}
