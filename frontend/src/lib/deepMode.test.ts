import { describe, expect, it } from 'vitest'
import { applyEvent, initialDeepState } from './deepMode'

describe('deepMode reducer', () => {
  it('starts idle', () => {
    expect(initialDeepState.kind).toBe('idle')
  })

  it('moves to indexing on a phase event', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'embedding',
      current: 10,
      total: 100,
      message: null,
    })
    expect(next.kind).toBe('indexing')
    if (next.kind === 'indexing') {
      expect(next.phase).toBe('embedding')
      expect(next.progress).toEqual({ current: 10, total: 100 })
    }
  })

  it('moves to ready', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'ready', current: null, total: null, message: null,
    })
    expect(next.kind).toBe('ready')
  })

  it('moves to too_large with counts', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'too_large', current: 5000, total: 1500, message: null,
    })
    expect(next).toEqual({ kind: 'too_large', count: 5000, limit: 1500 })
  })

  it('moves to failed with message', () => {
    const next = applyEvent(initialDeepState, {
      phase: 'failed', current: null, total: null, message: 'boom',
    })
    expect(next).toEqual({ kind: 'failed', message: 'boom' })
  })
})
