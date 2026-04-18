import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = url.trim().match(/github\.com\/([^/\s]+)\/([^/\s]+)/)
    if (!match) {
      setError(true)
      inputRef.current?.focus()
      return
    }
    setError(false)
    navigate(`/${match[1]}/${match[2]}`)
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'clamp(2rem, 8vw, 6rem)',
        maxWidth: '900px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Wordmark */}
      <div
        className="fade-up"
        style={{
          fontSize: '11px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          marginBottom: 'clamp(3rem, 10vh, 6rem)',
          fontWeight: 500,
        }}
      >
        AskAboutGit
      </div>

      {/* Headline */}
      <h1
        className="fade-up fade-up-delay-1"
        style={{
          fontSize: 'clamp(2.8rem, 7vw, 6rem)',
          lineHeight: 1.0,
          letterSpacing: '-0.03em',
          margin: '0 0 clamp(2rem, 5vh, 3.5rem)',
          fontWeight: 800,
        }}
      >
        Chat with any
        <br />
        <span style={{ color: 'var(--green)', fontWeight: 300 }}>
          GitHub repository.
        </span>
      </h1>

      {/* Subtitle */}
      <p
        className="fade-up fade-up-delay-2"
        style={{
          fontSize: 'clamp(0.9rem, 1.5vw, 1.05rem)',
          color: 'var(--muted-foreground)',
          marginBottom: 'clamp(2.5rem, 6vh, 4rem)',
          lineHeight: 1.6,
          maxWidth: '420px',
          fontWeight: 400,
        }}
      >
        Paste any public GitHub URL. Understand the codebase instantly — no
        cloning, no setup, no account required.
      </p>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="fade-up fade-up-delay-3"
        style={{ width: '100%', maxWidth: '560px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
            paddingBottom: '12px',
            gap: '12px',
            transition: 'border-color 0.2s',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              color: 'var(--muted-foreground)',
              whiteSpace: 'nowrap',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            github.com/
          </span>

          <input
            ref={inputRef}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(false)
            }}
            placeholder="owner/repo"
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--foreground)',
              fontSize: 'clamp(0.95rem, 1.4vw, 1.05rem)',
              fontFamily: 'inherit',
              fontWeight: 400,
              caretColor: 'var(--green)',
            }}
          />

          <button
            type="submit"
            style={{
              background: 'var(--green)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.01em',
              transition: 'opacity 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Ask →
          </button>
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px' }}>
            Paste a full GitHub URL, e.g. github.com/facebook/react
          </p>
        )}

        <p
          style={{
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            marginTop: '16px',
            lineHeight: 1.5,
          }}
        >
          Or swap the URL directly —{' '}
          <span style={{ color: 'var(--foreground)', opacity: 0.4 }}>
            github.com → askaboutgit.guyregev.dev
          </span>
        </p>
      </form>
    </div>
  )
}
