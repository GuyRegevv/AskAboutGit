import type { DeepModeState } from '@/lib/deepMode'

type Props = {
  state: DeepModeState
  onEnable: () => void
  onRetry: () => void
}

const barStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border)',
  padding: '8px clamp(1.5rem, 8vw, 4rem)',
  display: 'flex',
  alignItems: 'center',
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.05em',
  color: 'var(--muted-foreground)',
}

const btnStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--muted-foreground)',
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '2px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '0.05em',
  flexShrink: 0,
}

export function DeepModeBanner({ state, onEnable, onRetry }: Props) {
  if (state.kind === 'ready') return null

  if (state.kind === 'idle') {
    return (
      <div style={{ ...barStyle, justifyContent: 'flex-end', gap: '12px' }}>
        <span style={labelStyle}>
          Index the full repo for deeper, retrieval-backed answers.
        </span>
        <button
          onClick={onEnable}
          style={btnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
        >
          Enable deep mode
        </button>
      </div>
    )
  }

  if (state.kind === 'indexing') {
    const pct =
      state.progress && state.progress.total > 0
        ? Math.round((state.progress.current / state.progress.total) * 100)
        : null
    return (
      <div style={{ ...barStyle, gap: '12px' }}>
        <span
          style={{
            ...labelStyle,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            flexShrink: 0,
          }}
        >
          {state.phase}
        </span>
        <div
          style={{
            flex: 1,
            height: '1px',
            background: 'var(--border)',
            borderRadius: '1px',
            overflow: 'hidden',
          }}
        >
          {pct !== null && (
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--green)',
                transition: 'width 0.3s ease',
              }}
            />
          )}
        </div>
        {state.progress && (
          <span style={{ ...labelStyle, fontFamily: 'monospace', flexShrink: 0 }}>
            {state.progress.current}/{state.progress.total}
          </span>
        )}
      </div>
    )
  }

  if (state.kind === 'too_large') {
    return (
      <div style={barStyle}>
        <span style={labelStyle}>
          Repo has {state.count} files — deep mode cap is {state.limit}. Standard chat still works.
        </span>
      </div>
    )
  }

  // failed
  return (
    <div style={{ ...barStyle, justifyContent: 'space-between' }}>
      <span style={{ ...labelStyle, color: '#ef4444' }}>
        Indexing failed: {state.message}
      </span>
      <button
        onClick={onRetry}
        style={{ ...btnStyle, marginLeft: '12px' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
      >
        Retry
      </button>
    </div>
  )
}
