import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { streamIndex } from './api'
import type { IndexEvent } from './deepMode'

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l))
      c.close()
    },
  })
}

describe('streamIndex', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(sseStream([
        'data: {"phase":"downloading","current":null,"total":null,"message":null}\n\n',
        'data: {"phase":"ready","current":null,"total":null,"message":null}\n\n',
        'data: [DONE]\n\n',
      ]), { status: 200 })
    ))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('emits parsed events and ends', async () => {
    const events: IndexEvent[] = []
    const done = vi.fn()
    await streamIndex('o', 'r', e => events.push(e), done, () => {})
    expect(events.map(e => e.phase)).toEqual(['downloading', 'ready'])
    expect(done).toHaveBeenCalledOnce()
  })
})
