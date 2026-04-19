import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FilesModal from '../components/FilesModal'

describe('FilesModal', () => {
  it('renders all file paths', () => {
    render(
      <FilesModal
        files={['README.md', 'src/index.ts', 'package.json']}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('src/index.ts')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
  })

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn()
    render(<FilesModal files={['README.md']} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<FilesModal files={['README.md']} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('files-modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<FilesModal files={['README.md']} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
