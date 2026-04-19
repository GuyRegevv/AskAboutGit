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
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, question }),
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
      const text = line.slice(6).replace(/\\n/g, '\n')
      if (text === '[DONE]') {
        onDone()
        return
      }
      if (text === '[ERROR]') {
        onError('The AI encountered an error. Please try again.')
        return
      }
      onToken(text)
    }
  }

  onDone()
}
