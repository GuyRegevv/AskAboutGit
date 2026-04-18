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
            fontFamily: "'Oxanium Variable', sans-serif",
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
          fontFamily: "'Oxanium Variable', sans-serif",
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
