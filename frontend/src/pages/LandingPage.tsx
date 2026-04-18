import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LandingPage() {
  const [url, setUrl] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = url.match(/github\.com\/([^/]+)\/([^/\s]+)/)
    if (!match) return
    navigate(`/${match[1]}/${match[2]}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="max-w-xl w-full space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">AskAboutGit</h1>
          <p className="text-muted-foreground text-lg">
            Chat with any public GitHub repository. No setup required.
          </p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground bg-muted rounded-lg p-4 text-left">
          <p className="font-medium text-foreground">How it works:</p>
          <p>
            Take any GitHub URL and replace{' '}
            <code className="font-mono bg-background rounded px-1">github.com</code> with{' '}
            <code className="font-mono bg-background rounded px-1">askaboutgit.guyregev.dev</code>
          </p>
          <p className="font-mono text-xs bg-background rounded p-2 mt-1">
            github.com/facebook/react →{' '}
            askaboutgit.guyregev.dev/facebook/react
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a GitHub URL..."
            className="flex-1"
          />
          <Button type="submit" disabled={!url.trim()}>
            Ask
          </Button>
        </form>
      </div>
    </div>
  )
}
