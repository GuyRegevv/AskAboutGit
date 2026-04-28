export type IndexEvent = {
  phase:
    | 'downloading' | 'extracting' | 'selecting' | 'chunking'
    | 'embedding' | 'storing' | 'ready' | 'failed' | 'too_large'
  current: number | null
  total: number | null
  message: string | null
}

export type DeepModeState =
  | { kind: 'idle' }
  | { kind: 'indexing'; phase: IndexEvent['phase']; progress?: { current: number; total: number } }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string }
  | { kind: 'too_large'; count: number; limit: number }

export const initialDeepState: DeepModeState = { kind: 'idle' }

export function applyEvent(_prev: DeepModeState, ev: IndexEvent): DeepModeState {
  if (ev.phase === 'ready') return { kind: 'ready' }
  if (ev.phase === 'failed') {
    return { kind: 'failed', message: ev.message ?? 'Indexing failed' }
  }
  if (ev.phase === 'too_large') {
    return { kind: 'too_large', count: ev.current ?? 0, limit: ev.total ?? 0 }
  }
  const progress =
    ev.current != null && ev.total != null
      ? { current: ev.current, total: ev.total }
      : undefined
  return { kind: 'indexing', phase: ev.phase, progress }
}
