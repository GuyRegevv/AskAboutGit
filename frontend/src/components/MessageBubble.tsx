interface Props {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export default function MessageBubble({ role, content, streaming }: Props) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}
      >
        {content}
        {streaming && (
          <span className="inline-block w-1 h-3 ml-0.5 bg-current animate-pulse" />
        )}
      </div>
    </div>
  )
}
