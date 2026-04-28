import type { DeepModeState } from '@/lib/deepMode'

type Props = {
  state: DeepModeState
  onEnable: () => void
  onRetry: () => void
}

export function DeepModeBanner({ state, onEnable, onRetry }: Props) {
  if (state.kind === 'idle') {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm flex items-center justify-between">
        <span className="text-zinc-300">
          Want answers backed by the full repo? Enable Deep mode to index every file.
        </span>
        <button
          onClick={onEnable}
          className="ml-4 rounded bg-amber-500 px-3 py-1 text-zinc-900 font-medium hover:bg-amber-400"
        >
          Enable Deep mode
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
      <div className="rounded-md border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm">
        <div className="flex items-center justify-between text-zinc-200">
          <span className="capitalize">{state.phase}…</span>
          {state.progress && (
            <span className="font-mono text-xs text-zinc-400">
              {state.progress.current} / {state.progress.total}
            </span>
          )}
        </div>
        {pct !== null && (
          <div className="mt-2 h-1 w-full rounded bg-zinc-800 overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    )
  }

  if (state.kind === 'ready') {
    return (
      <div className="rounded-md border border-emerald-700/40 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-200">
        Deep mode active — answers use full repo context.
      </div>
    )
  }

  if (state.kind === 'too_large') {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
        This repo has {state.count} source files. Deep mode is capped at {state.limit}. Standard chat is still available.
      </div>
    )
  }

  return (
    <div className="rounded-md border border-rose-700/40 bg-rose-950/30 px-4 py-3 text-sm flex items-center justify-between">
      <span className="text-rose-200">Indexing failed: {state.message}</span>
      <button
        onClick={onRetry}
        className="ml-4 rounded bg-rose-500 px-3 py-1 text-zinc-900 font-medium hover:bg-rose-400"
      >
        Retry
      </button>
    </div>
  )
}
