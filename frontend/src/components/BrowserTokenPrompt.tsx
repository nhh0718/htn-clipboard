import { useState } from 'react'
import { useTranslation } from '../lib/i18n'

interface BrowserTokenPromptProps {
  onConnect: (token: string) => void
}

export function BrowserTokenPrompt({ onConnect }: BrowserTokenPromptProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const t = useTranslation()

  async function handleConnect() {
    const trimmed = token.trim()
    if (!trimmed) return

    setError('')
    try {
      const r = await fetch('http://127.0.0.1:27843/api/v1/history?limit=1', {
        headers: { Authorization: `Bearer ${trimmed}` },
      })
      if (r.ok) {
        localStorage.setItem('clipboard-pro-token', trimmed)
        onConnect(trimmed)
      } else {
        setError(t('browser_token_invalid'))
      }
    } catch {
      setError(t('browser_token_offline'))
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground px-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-bold text-center">Clipboard Pro</h1>
        <p className="text-xs text-muted-foreground text-center">{t('browser_token_desc')}</p>

        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          placeholder="Auth Token"
          className="w-full h-10 px-3 rounded-lg text-sm bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          autoFocus
        />

        {error && <p className="text-xs text-destructive text-center">{error}</p>}

        <button
          onClick={handleConnect}
          className="w-full h-10 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {t('browser_connect')}
        </button>

        <p className="text-[10px] text-muted-foreground text-center">
          {t('browser_token_hint')}
        </p>
      </div>
    </div>
  )
}
