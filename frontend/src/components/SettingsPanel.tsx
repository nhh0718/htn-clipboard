import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { X, Copy, Eye, EyeOff } from 'lucide-react'
import type { AppConfig } from '../types/clipboard'
import { GetConfig, SaveConfig } from '../services/wails-bridge'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [retentionDays, setRetentionDays] = useState(30)
  const [maxItems, setMaxItems] = useState(500)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    GetConfig()
      .then((cfg) => {
        setConfig(cfg)
        setRetentionDays(cfg.retentionDays)
        setMaxItems(cfg.maxItems)
      })
      .catch(() => setSaveError('Failed to load settings.'))
  }, [])

  function handleCopyToken() {
    if (!config) return
    navigator.clipboard.writeText(config.authToken).catch(() => {})
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  async function handleSave() {
    if (!config) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const updated: AppConfig = { ...config, retentionDays, maxItems }
      await SaveConfig(updated)
      setConfig(updated)
      onClose()
    } catch {
      setSaveError('Failed to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    /* Slide-in overlay panel */
    <div className="flex flex-col h-full bg-card border-l border-border animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {config === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* Read-only fields */}
            <FieldRow label="HTTP Port">
              <ReadonlyInput value={String(config.port)} />
            </FieldRow>

            <FieldRow label="Auth Token">
              <div className="flex items-center gap-1">
                <ReadonlyInput
                  value={tokenVisible ? config.authToken : '•'.repeat(Math.min(config.authToken.length, 20))}
                  className="flex-1 font-mono text-xs"
                />
                <button
                  onClick={() => setTokenVisible((v) => !v)}
                  aria-label={tokenVisible ? 'Hide token' : 'Show token'}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  {tokenVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={handleCopyToken}
                  aria-label="Copy auth token"
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  {tokenCopied ? (
                    <span className="text-[10px] text-emerald-400 font-medium">Copied</span>
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            </FieldRow>

            <FieldRow label="Hotkey">
              <ReadonlyInput value={config.hotkey} />
            </FieldRow>

            <FieldRow label="Data Directory">
              <ReadonlyInput value={config.dataDir} className="font-mono text-xs" />
            </FieldRow>

            {/* Editable fields */}
            <FieldRow label="Retention (days)">
              <input
                type="number"
                min={1}
                max={365}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full h-8 px-2 rounded-md text-sm bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </FieldRow>

            <FieldRow label="Max Items">
              <input
                type="number"
                min={10}
                max={10000}
                value={maxItems}
                onChange={(e) => setMaxItems(Number(e.target.value))}
                className="w-full h-8 px-2 rounded-md text-sm bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </FieldRow>
          </>
        )}

        {saveError && (
          <p className="text-xs text-destructive">{saveError}</p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 px-4 py-3 border-t border-border shrink-0">
        <button
          onClick={onClose}
          className="flex-1 h-8 rounded-md text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || config === null}
          className="flex-1 h-8 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Internal sub-components ───────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

function ReadonlyInput({ value, className = '' }: { value: string; className?: string }) {
  return (
    <div
      className={[
        'w-full h-8 px-2 flex items-center rounded-md text-sm',
        'bg-muted/50 border border-border text-foreground/80 truncate',
        className,
      ].join(' ')}
      title={value}
    >
      {value}
    </div>
  )
}
