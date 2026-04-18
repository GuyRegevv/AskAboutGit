import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadRepo, streamChat } from '@/lib/api'
import ChatWindow, { type Message } from '@/components/ChatWindow'
import ChatInput from '@/components/ChatInput'

type PageState = 'loading' | 'ready' | 'error'

function generateId() {
  return Math.random().toString(36).slice(2)
}

export default function ChatPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)

  useEffect(() => {
    if (!owner || !repo) {
      navigate('/')
      return
    }

    loadRepo(owner, repo)
      .then(() => {
        setMessages([
          {
            id: generateId(),
            role: 'assistant',
            content: `Ask me anything about **${owner}/${repo}**.`,
          },
        ])
        setState('ready')
      })
      .catch((err: Error) => {
        setErrorMsg(err.message)
        setState('error')
      })
  }, [owner, repo, navigate])

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
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )
          )
        },
        () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m
            )
          )
          setStreaming(false)
        },
        (errMsg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: errMsg, streaming: false }
                : m
            )
          )
          setStreaming(false)
        }
      )
    },
    [owner, repo, streaming]
  )

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading {owner}/{repo}…
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{errorMsg}</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-muted-foreground underline"
        >
          Try another repository
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="border-b px-4 py-3 text-sm font-medium text-muted-foreground">
        <span className="text-foreground font-semibold">
          {owner}/{repo}
        </span>
        {' · '}
        <button onClick={() => navigate('/')} className="hover:underline">
          Change repo
        </button>
      </header>

      <ChatWindow messages={messages} />
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  )
}
