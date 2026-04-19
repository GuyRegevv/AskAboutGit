import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadRepo } from '../lib/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadRepo', () => {
  it('returns the files array from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            owner: 'facebook',
            repo: 'react',
            status: 'ready',
            files: ['README.md', 'package.json'],
          }),
      }),
    )

    const files = await loadRepo('facebook', 'react')
    expect(files).toEqual(['README.md', 'package.json'])
  })

  it('throws with the detail message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: 'Repository not found or is private.' }),
      }),
    )

    await expect(loadRepo('owner', 'repo')).rejects.toThrow(
      'Repository not found or is private.',
    )
  })
})
