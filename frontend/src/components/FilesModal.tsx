import { useEffect } from 'react'
import type React from 'react'

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
  padding: '10px 18px 4px',
  margin: 0,
}

const listStyle: React.CSSProperties = {
  padding: '4px 18px 10px',
  margin: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const fileItemStyle: React.CSSProperties = {
  fontSize: '12px',
  fontFamily: 'monospace',
  color: 'var(--foreground)',
  opacity: 0.85,
}

interface FilesModalProps {
  files: string[]
  onClose: () => void
  deepMode?: boolean
  retrievedFiles?: string[]
}

export default function FilesModal({ files, onClose, deepMode, retrievedFiles }: FilesModalProps) {
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
        role="dialog"
        aria-modal="true"
        aria-label="Context files"
        onClick={(e) => e.stopPropagation()}
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
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {retrievedFiles && retrievedFiles.length > 0 && (
            <>
              <p style={sectionLabelStyle}>Retrieved for last question</p>
              <ul style={listStyle}>
                {retrievedFiles.map((path) => (
                  <li key={path} style={{ ...fileItemStyle, color: 'var(--green)' }}>
                    {path}
                  </li>
                ))}
              </ul>
              <div style={{ borderTop: '1px solid var(--border)', margin: '0 18px' }} />
              <p style={sectionLabelStyle}>Priority files</p>
            </>
          )}
          <ul style={listStyle}>
            {files.map((path) => (
              <li key={path} style={fileItemStyle}>{path}</li>
            ))}
          </ul>
        </div>

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
          {deepMode
            ? 'Priority files pre-loaded. Deep mode retrieves additional files per question.'
            : 'These are the files the AI has access to for this repository.'}
        </p>
      </div>
    </>
  )
}
