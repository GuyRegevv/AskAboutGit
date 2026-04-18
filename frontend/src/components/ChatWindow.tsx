import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface Props {
  messages: Message[]
}

export default function ChatWindow({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 8vw, 4rem)',
      }}
    >
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            streaming={msg.streaming}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
