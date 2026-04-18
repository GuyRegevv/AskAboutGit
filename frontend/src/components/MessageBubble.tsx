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

  // Assistant — no bubble, just text
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <p
        style={{
          fontSize: 'clamp(0.95rem, 1.3vw, 1.05rem)',
          lineHeight: 1.75,
          color: 'var(--foreground)',
          fontWeight: 400,
          letterSpacing: '0.01em',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
        {streaming && <span className="cursor-blink" />}
      </p>
    </div>
  )
}
