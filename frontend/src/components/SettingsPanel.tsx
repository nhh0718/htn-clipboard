import { useState, useEffect, useContext, type ReactNode } from 'react'
import { X, Eye, EyeOff, Copy, Moon, Sun, Globe, Activity, Download, RefreshCw, ExternalLink } from 'lucide-react'
import type { AppConfig, HealthStatus, UpdateInfo } from '../types/clipboard'
import { GetConfig, SaveConfig, GetHealth, GetVersion, CheckForUpdate } from '../services/wails-bridge'
import { LangContext, LangSetterContext, useTranslation, type Lang } from '../lib/i18n'
import { ThemeContext, type Theme } from '../lib/theme'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const lang = useContext(LangContext)
  const { theme, setTheme } = useContext(ThemeContext)
  const { setLang } = useContext(LangSetterContext)
  const t = useTranslation()

  const [config, setConfig] = useState<AppConfig | null>(null)
  const [retentionDays, setRetentionDays] = useState(30)
  const [maxItems, setMaxItems] = useState(1000)
  const [autoStart, setAutoStart] = useState(true)
  const [tokenVisible, setTokenVisible] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [appVersion, setAppVersion] = useState('...')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  useEffect(() => {
    GetConfig()
      .then((cfg) => {
        setConfig(cfg)
        setRetentionDays(cfg.retentionDays)
        setMaxItems(cfg.maxItems)
        setAutoStart(cfg.autoStart)
      })
      .catch(() => setError(t('load_failed')))

    GetHealth()
      .then(setHealth)
      .catch(() => {}) // non-critical

    GetVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('unknown'))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCheckUpdate() {
    setCheckingUpdate(true)
    try {
      const info = await CheckForUpdate()
      setUpdateInfo(info)
    } catch {
      setUpdateInfo(null)
    } finally {
      setCheckingUpdate(false)
    }
  }

  function handleCopyToken() {
    if (!config) return
    navigator.clipboard.writeText(config.authToken).catch(() => {})
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  async function handleSave() {
    if (!config) return
    const days = Math.max(1, Math.min(365, retentionDays))
    const items = Math.max(10, Math.min(10000, maxItems))
    setIsSaving(true)
    setError(null)
    try {
      const updated: AppConfig = { ...config, retentionDays: days, maxItems: items, autoStart }
      await SaveConfig(updated)
      setConfig(updated)
      onClose()
    } catch {
      setError(t('save_failed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">{t('settings')}</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-6">

        {/* ── Appearance ── */}
        <Section label={t('appearance')}>
          <Row label={t('theme')}>
            <SegmentControl>
              <Segment active={theme === 'dark'} onClick={() => setTheme('dark' as Theme)}>
                <Moon size={12} /> {t('theme_dark')}
              </Segment>
              <Segment active={theme === 'light'} onClick={() => setTheme('light' as Theme)}>
                <Sun size={12} /> {t('theme_light')}
              </Segment>
            </SegmentControl>
          </Row>

          <Row label={t('language')}>
            <SegmentControl>
              <Segment active={lang === 'vi'} onClick={() => setLang('vi' as Lang)}>
                <Globe size={12} /> Tiếng Việt
              </Segment>
              <Segment active={lang === 'en'} onClick={() => setLang('en' as Lang)}>
                <Globe size={12} /> English
              </Segment>
            </SegmentControl>
          </Row>
        </Section>

        {/* ── General ── */}
        <Section label={t('general')}>
          {config === null ? (
            <p className="text-sm text-muted-foreground py-2">{t('loading')}</p>
          ) : (
            <>
              {/* Auto Start toggle */}
              <Row label={t('auto_start')}>
                <button
                  onClick={() => setAutoStart(v => !v)}
                  className={[
                    'relative w-10 h-5 rounded-full transition-colors',
                    autoStart ? 'bg-primary' : 'bg-muted-foreground/30',
                  ].join(' ')}
                >
                  <span className={[
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    autoStart ? 'left-[22px]' : 'left-0.5',
                  ].join(' ')} />
                </button>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t('auto_start_desc')}</p>
              </Row>

              <Row label={t('hotkey')}>
                <Readonly value={config.hotkey} />
              </Row>

              <Row label={t('retention_days')}>
                <input
                  type="number" min={1} max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg text-sm bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </Row>

              <Row label={t('max_items')}>
                <input
                  type="number" min={10} max={10000}
                  value={maxItems}
                  onChange={(e) => setMaxItems(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg text-sm bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </Row>

              <Row label={t('auth_token')}>
                <div className="flex gap-1.5">
                  <div className="flex-1 min-w-0 h-9 px-3 flex items-center rounded-lg text-xs font-mono bg-muted border border-border text-foreground/70 truncate">
                    {tokenVisible ? config.authToken : '•'.repeat(Math.min(config.authToken.length, 28))}
                  </div>
                  <IconBtn onClick={() => setTokenVisible(v => !v)} title={tokenVisible ? t('hide_token') : t('show_token')}>
                    {tokenVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                  </IconBtn>
                  <IconBtn onClick={handleCopyToken} title={t('copy_token')}>
                    {tokenCopied
                      ? <span className="text-[10px] text-emerald-500 font-semibold">OK</span>
                      : <Copy size={13} />}
                  </IconBtn>
                </div>
              </Row>

              <Row label={t('http_port')}>
                <Readonly value={String(config.port)} />
              </Row>

              <Row label={t('data_dir')}>
                <Readonly value={config.dataDir} mono />
              </Row>
            </>
          )}
        </Section>

        {/* ── Health Check ── */}
        <Section label={t('health_title')}>
          {health === null ? (
            <p className="text-sm text-muted-foreground py-2">{t('loading')}</p>
          ) : (
            <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
              <HealthRow icon={<Activity size={12} className="text-emerald-400" />} label={t('health_status')} value={health.status} />
              <HealthRow label={t('health_uptime')} value={health.uptime} />
              <HealthRow label={t('health_items')} value={String(health.dbItems)} />
              <HealthRow label={t('health_api')} value={`:${health.apiPort}`} />
              <HealthRow
                label={t('health_monitor')}
                value={health.monitor ? t('health_active') : t('health_inactive')}
                positive={health.monitor}
              />
              <HealthRow
                label={t('health_autostart')}
                value={health.autoStart ? t('health_enabled') : t('health_disabled')}
                positive={health.autoStart}
              />
            </div>
          )}
        </Section>

        {/* ── About & Update ── */}
        <Section label={t('about')}>
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('version')}</span>
              <span className="text-xs font-mono font-medium text-foreground">{appVersion}</span>
            </div>

            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={checkingUpdate ? 'animate-spin' : ''} />
              {checkingUpdate ? t('checking_update') : t('check_update')}
            </button>

            {updateInfo && (
              <div className={`rounded-lg p-2.5 text-xs space-y-2 ${updateInfo.available ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-muted'}`}>
                {updateInfo.available ? (
                  <>
                    <p className="font-medium text-emerald-400">
                      {t('update_available')}: {updateInfo.latest}
                    </p>
                    <div className="flex gap-1.5">
                      <a
                        href={updateInfo.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 h-7 flex items-center justify-center gap-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        <Download size={11} /> {t('download')}
                      </a>
                      <a
                        href={updateInfo.releaseURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 px-2 flex items-center justify-center gap-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <ExternalLink size={11} /> Release
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-center">{t('up_to_date')}</p>
                )}
              </div>
            )}
          </div>
        </Section>

        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-4 py-3 border-t border-border shrink-0">
        <button
          onClick={onClose}
          className="flex-1 h-9 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {t('cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || config === null}
          className="flex-1 h-9 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {isSaving ? t('saving') : t('save')}
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Readonly({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <div
      title={value}
      className={`h-9 px-3 flex items-center rounded-lg text-sm bg-muted border border-border text-foreground/60 truncate ${mono ? 'font-mono text-xs' : ''}`}
    >
      {value}
    </div>
  )
}

function SegmentControl({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs w-full">
      {children}
    </div>
  )
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 transition-colors',
        active
          ? 'bg-primary text-primary-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
    >
      {children}
    </button>
  )
}

function HealthRow({ icon, label, value, positive }: { icon?: ReactNode; label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={[
        'font-medium',
        positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-foreground',
      ].join(' ')}>
        {value}
      </span>
    </div>
  )
}
