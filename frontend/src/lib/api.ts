import type { IndexEvent } from './deepMode'

export async function loadRepo(owner: string, repo: string): Promise<string[]> {
  const res = await fetch(`/api/repo/${owner}/${repo}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Failed to load repository (${res.status})`)
  }
  const data = await res.json()
  return data.files as string[]
}

export async function streamChat(
  owner: string,
  repo: string,
  question: string,
  mode: 'free' | 'deep',
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
  onFiles?: (files: string[]) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, question, mode }),
    })
  } catch {
    onError('Network error. Check your connection and try again.')
    return
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    onError(body.detail ?? `Request failed (${response.status})`)
    return
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6)
      if (raw === '[DONE]') { onDone(); return }
      if (raw === '[ERROR]') { onError('The AI encountered an error. Please try again.'); return }
      if (raw.startsWith('[META]')) {
        try { onFiles?.(JSON.parse(raw.slice(6)).files) } catch { /* ignore */ }
        continue
      }
      onToken(raw.replace(/\\n/g, '\n'))
    }
  }
  onDone()
}

export async function streamIndex(
  owner: string,
  repo: string,
  onEvent: (ev: IndexEvent) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/index/${owner}/${repo}`, { method: 'POST' })
  } catch {
    onError('Network error. Check your connection and try again.')
    return
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    onError(body.detail ?? `Indexing failed (${response.status})`)
    return
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') { onDone(); return }
      try {
        onEvent(JSON.parse(payload) as IndexEvent)
      } catch {
        // ignore malformed lines
      }
    }
  }
  onDone()
}
