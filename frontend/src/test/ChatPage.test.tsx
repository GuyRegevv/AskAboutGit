import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ChatPage from '../pages/ChatPage'
import * as api from '../lib/api'

vi.mock('../lib/api', () => ({
  loadRepo: vi.fn(),
  streamChat: vi.fn(),
}))

function renderChatPage() {
  return render(
    <MemoryRouter initialEntries={['/facebook/react']}>
      <Routes>
        <Route path="/:owner/:repo" element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.mocked(api.loadRepo).mockReset()
    vi.mocked(api.streamChat).mockReset()
  })

  it('shows "Try again" button after a load failure', async () => {
    vi.mocked(api.loadRepo).mockRejectedValueOnce(new Error('Repo not found'))
    renderChatPage()
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
  })

  it('clicking "Try again" triggers a second load attempt', async () => {
    vi.mocked(api.loadRepo)
      .mockRejectedValueOnce(new Error('Repo not found'))
      .mockResolvedValueOnce(['README.md'])
    renderChatPage()
    await waitFor(() => screen.getByText('Try again'))
    fireEvent.click(screen.getByText('Try again'))
    await waitFor(() => expect(vi.mocked(api.loadRepo)).toHaveBeenCalledTimes(2))
  })

  it('shows "{n} files loaded" badge when ready', async () => {
    vi.mocked(api.loadRepo).mockResolvedValueOnce(['README.md', 'package.json'])
    renderChatPage()
    await waitFor(() =>
      expect(screen.getByText('2 files loaded')).toBeInTheDocument(),
    )
  })
})
