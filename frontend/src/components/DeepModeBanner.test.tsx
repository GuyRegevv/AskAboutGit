import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeepModeBanner } from './DeepModeBanner'

describe('DeepModeBanner', () => {
  it('idle: shows enable button and fires callback', () => {
    const onEnable = vi.fn()
    render(<DeepModeBanner state={{ kind: 'idle' }} onEnable={onEnable} onRetry={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /enable deep mode/i }))
    expect(onEnable).toHaveBeenCalledOnce()
  })

  it('indexing: shows phase and progress', () => {
    render(
      <DeepModeBanner
        state={{ kind: 'indexing', phase: 'embedding', progress: { current: 30, total: 100 } }}
        onEnable={() => {}} onRetry={() => {}}
      />
    )
    expect(screen.getByText(/embedding/i)).toBeInTheDocument()
    expect(screen.getByText(/30\s*\/\s*100/)).toBeInTheDocument()
  })

  it('ready: shows confirmation badge', () => {
    render(<DeepModeBanner state={{ kind: 'ready' }} onEnable={() => {}} onRetry={() => {}} />)
    expect(screen.getByText(/deep mode active/i)).toBeInTheDocument()
  })

  it('too_large: shows counts', () => {
    render(
      <DeepModeBanner
        state={{ kind: 'too_large', count: 5000, limit: 1500 }}
        onEnable={() => {}} onRetry={() => {}}
      />
    )
    expect(screen.getByText(/5000/)).toBeInTheDocument()
    expect(screen.getByText(/1500/)).toBeInTheDocument()
  })

  it('failed: shows retry button', () => {
    const onRetry = vi.fn()
    render(
      <DeepModeBanner
        state={{ kind: 'failed', message: 'boom' }}
        onEnable={() => {}} onRetry={onRetry}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
