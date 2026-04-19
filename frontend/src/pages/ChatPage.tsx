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
