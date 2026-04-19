import { useEffect } from 'react'

interface FilesModalProps {
  files: string[]
  onClose: () => void
}

export default function FilesModal({ files, onClose }: FilesModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="files-modal-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 50,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 51,
          background: 'var(--background, #0a0a0a)',
          border: '1px solid var(--border, #222)',
          borderRadius: '8px',
          width: 'min(480px, 90vw)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border, #222)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
              fontWeight: 500,
            }}
          >
            Context files
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted-foreground)',
              fontSize: '18px',
              fontFamily: 'inherit',
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>

        {/* File list */}
        <ul
          style={{
            overflowY: 'auto',
            padding: '12px 18px',
            margin: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            flex: 1,
          }}
        >
          {files.map((path) => (
            <li
              key={path}
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                color: 'var(--foreground)',
                opacity: 0.85,
              }}
            >
              {path}
            </li>
          ))}
        </ul>

        {/* Footer */}
        <p
          style={{
            fontSize: '11px',
            color: 'var(--muted-foreground)',
            padding: '10px 18px',
            margin: 0,
            borderTop: '1px solid var(--border, #222)',
            flexShrink: 0,
          }}
        >
          These are the files the AI has access to for this repository.
        </p>
      </div>
    </>
  )
}
