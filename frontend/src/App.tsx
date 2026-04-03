import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Pin, PinOff, BarChart3, ClipboardList as ClipboardIcon, Download, X, Loader2 } from 'lucide-react'
import './App.css'
import { SearchBar } from './components/SearchBar'
import { ClipboardList } from './components/ClipboardList'
import { SettingsPanel } from './components/SettingsPanel'
import { AnalyticsDashboard } from './components/AnalyticsDashboard'
import type { ClipboardItem, SearchFilter, UpdateInfo } from './types/clipboard'
import { GetHistory, Search, CopyItem, DeleteItem, TogglePin, EventsOn, EventsOff, inWails, SetAlwaysOnTop, IsAlwaysOnTop, DownloadAndInstallUpdate } from './services/wails-bridge'
import { LangContext, LangSetterContext, useTranslation, type Lang } from './lib/i18n'
import { ThemeContext, useThemeState } from './lib/theme'
import { BrowserTokenPrompt } from './components/BrowserTokenPrompt'

const PAGE_SIZE = 50
const BROWSER_POLL_INTERVAL = 3000 // 3s polling for browser mode

function App() {
  const { theme, setTheme } = useThemeState()
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('clipboard-pro-lang') as Lang) ?? 'en')

  // Browser mode: require auth token before showing the app
  const [browserAuthed, setBrowserAuthed] = useState(() =>
    inWails() || !!localStorage.getItem('clipboard-pro-token')
  )

  // Persist lang to localStorage
  useEffect(() => {
    localStorage.setItem('clipboard-pro-lang', lang)
  }, [lang])

  const [items, setItems] = useState<ClipboardItem[]>([])
  const [filter, setFilter] = useState<SearchFilter>({ query: '', itemType: '', timeRange: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'history' | 'analytics' | 'settings'>('history')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const filterRef = useRef(filter)
  filterRef.current = filter

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async (reset = false) => {
    setIsLoading(true)
    try {
      const currentOffset = reset ? 0 : offset
      const page = (await GetHistory(PAGE_SIZE, currentOffset)) ?? []
      setItems(prev => reset ? page : [...prev, ...page])
      setOffset(currentOffset + page.length)
      setHasMore(page.length === PAGE_SIZE)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setIsLoading(false)
    }
  }, [offset])

  // Load history when browserAuthed becomes true (covers both initial mount and post-token-entry)
  useEffect(() => {
    if (browserAuthed) loadHistory(true)
  }, [browserAuthed])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wails events (native app) ──────────────────────────────────────────────

  useEffect(() => {
    if (!inWails()) return // browser mode uses polling instead

    const handler = (item: ClipboardItem) => {
      if (!item || !item.id) return
      const f = filterRef.current
      if (!f.query && !f.itemType && !f.timeRange) {
        setItems(prev => {
          if (prev.some(i => i.id === item.id)) return prev
          return [item, ...prev]
        })
        setOffset(o => o + 1)
      }
    }
    EventsOn('clipboard:new', handler as (...data: unknown[]) => void)

    // Listen for data changes from HTTP API (web/extension did pin/delete)
    const refreshHandler = () => { loadHistory(true) }
    EventsOn('data:changed', refreshHandler as (...data: unknown[]) => void)

    return () => {
      EventsOff('clipboard:new')
      EventsOff('data:changed')
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Browser polling (web dashboard) ────────────────────────────────────────

  useEffect(() => {
    if (inWails() || !browserAuthed) return

    const interval = setInterval(async () => {
      const f = filterRef.current
      // Only poll when no active search/filter
      if (f.query || f.itemType || f.timeRange) return

      try {
        const fresh = (await GetHistory(PAGE_SIZE, 0)) ?? []
        setItems(prev => {
          // Merge: use fresh list as source of truth (handles new items, pin reorder, deletes)
          if (JSON.stringify(fresh.map(i => i.id)) !== JSON.stringify(prev.slice(0, fresh.length).map(i => i.id))) {
            return fresh
          }
          return prev
        })
      } catch { /* silent */ }
    }, BROWSER_POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [browserAuthed])

  // ── Search ──────────────────────────────────────────────────────────────────

  const hasActiveFilter = useCallback((f: SearchFilter) => {
    return f.query.trim() !== '' || f.itemType !== '' || f.timeRange !== ''
  }, [])

  const handleSearch = useCallback(async (newFilter: SearchFilter) => {
    setFilter(newFilter)
    setIsLoading(true)
    try {
      if (!hasActiveFilter(newFilter)) {
        const page = (await GetHistory(PAGE_SIZE, 0)) ?? []
        setItems(page)
        setOffset(page.length)
        setHasMore(page.length === PAGE_SIZE)
      } else {
        const results = (await Search(newFilter)) ?? []
        setItems(results)
        setOffset(results.length)
        setHasMore(false)
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [hasActiveFilter])

  // ── Infinite scroll ─────────────────────────────────────────────────────────

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore && !hasActiveFilter(filter)) loadHistory(false)
  }, [isLoading, hasMore, filter, loadHistory, hasActiveFilter])

  // ── Item actions ────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async (id: number) => {
    try { await CopyItem(id) } catch (err) { console.error('Copy failed:', err) }
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    setItems(prev => prev.filter(item => item.id !== id))
    if (selectedId === id) setSelectedId(null)
    if (!id) return
    try {
      await DeleteItem(id)
    } catch (err) { console.error('Delete failed:', err) }
  }, [selectedId])

  const handleTogglePin = useCallback(async (id: number) => {
    try {
      await TogglePin(id)
      // Flip isPinned AND re-sort: pinned first, then by createdAt desc
      setItems(prev => {
        const updated = prev.map(item =>
          item.id === id ? { ...item, isPinned: !item.isPinned } : item
        )
        return updated.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
      })
    } catch (err) { console.error('Toggle pin failed:', err) }
  }, [])

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (activeTab !== 'history') return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedId(cur => {
          if (items.length === 0) return null
          const idx = items.findIndex(i => i.id === cur)
          if (e.key === 'ArrowDown') return items[Math.min(idx + 1, items.length - 1)].id
          return items[Math.max(idx - 1, 0)].id
        })
      }
      if (e.key === 'Enter' && selectedId !== null) handleCopy(selectedId)
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, selectedId, activeTab, handleCopy])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!browserAuthed) {
    return (
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <LangContext.Provider value={lang}>
          <LangSetterContext.Provider value={{ setLang }}>
            <BrowserTokenPrompt onConnect={() => setBrowserAuthed(true)} />
          </LangSetterContext.Provider>
        </LangContext.Provider>
      </ThemeContext.Provider>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <LangContext.Provider value={lang}>
        <LangSetterContext.Provider value={{ setLang }}>
          <AppShell
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            items={items}
            selectedId={selectedId}
            isLoading={isLoading}
            filter={filter}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onLoadMore={handleLoadMore}
            onSearch={handleSearch}
          />
        </LangSetterContext.Provider>
      </LangContext.Provider>
    </ThemeContext.Provider>
  )
}

// ── AppShell reads translation from context ───────────────────────────────────

type TabType = 'history' | 'analytics' | 'settings'

interface ShellProps {
  activeTab: TabType
  setActiveTab: (v: TabType) => void
  items: ClipboardItem[]
  selectedId: number | null
  isLoading: boolean
  filter: SearchFilter
  onCopy: (id: number) => void
  onDelete: (id: number) => void
  onTogglePin: (id: number) => void
  onLoadMore: () => void
  onSearch: (f: SearchFilter) => void
}

function AppShell({ activeTab, setActiveTab, items, selectedId, isLoading, filter, onCopy, onDelete, onTogglePin, onLoadMore, onSearch }: ShellProps) {
  const t = useTranslation()
  const [pinned, setPinned] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [closingIn, setClosingIn] = useState<number | null>(null)
  const isNative = inWails()

  // Load initial always-on-top state
  useEffect(() => {
    if (isNative) IsAlwaysOnTop().then(setPinned).catch(() => {})
  }, [isNative])

  // Listen for background update check event
  useEffect(() => {
    EventsOn('update:available', (...args: unknown[]) => {
      setUpdateInfo(args[0] as UpdateInfo)
      setUpdateDismissed(false)
    })
    EventsOn('update:downloading', (...args: unknown[]) => {
      setDownloading(args[0] as boolean)
    })
    EventsOn('update:closing', (...args: unknown[]) => {
      let seconds = (args[0] as number) || 3
      setClosingIn(seconds)
      const interval = setInterval(() => {
        seconds -= 1
        setClosingIn(seconds)
        if (seconds <= 0) clearInterval(interval)
      }, 1000)
    })
    return () => {
      EventsOff('update:available')
      EventsOff('update:downloading')
      EventsOff('update:closing')
    }
  }, [])

  function handlePinWindow() {
    const next = !pinned
    setPinned(next)
    SetAlwaysOnTop(next)
  }

  async function handleInstallUpdate() {
    if (!updateInfo?.downloadURL) return
    setDownloading(true)
    try {
      await DownloadAndInstallUpdate(updateInfo.downloadURL)
    } catch (err) {
      console.error('[update] install error:', err)
      setDownloading(false)
    }
  }

  const showUpdateBanner = updateInfo?.available && !updateDismissed

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Update notification banner */}
      {showUpdateBanner && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-xs shrink-0">
          <Download size={13} />
          <span className="flex-1">
            {closingIn !== null ? (
              <>{t('update_closing')} <strong>{closingIn}s...</strong></>
            ) : (
              <>{t('update_banner')} <strong>{updateInfo.latest}</strong></>
            )}
          </span>
          {closingIn !== null ? (
            <Loader2 size={12} className="animate-spin" />
          ) : downloading ? (
            <span className="flex items-center gap-1 text-[10px] opacity-80">
              <Loader2 size={12} className="animate-spin" /> {t('update_downloading')}
            </span>
          ) : (
            <button
              onClick={handleInstallUpdate}
              className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 font-medium transition-colors"
            >
              {t('update_install')}
            </button>
          )}
          {closingIn === null && (
            <button
              onClick={() => setUpdateDismissed(true)}
              className="p-0.5 rounded hover:bg-white/20 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <SearchBar
          filter={filter}
          onSearch={onSearch}
          isSearching={isLoading}
          placeholder={t('search_placeholder')}
        />
        {/* Pin window button — only in native Wails app */}
        {isNative && (
          <button
            onClick={handlePinWindow}
            aria-label={pinned ? t('unpin_window') : t('pin_window')}
            title={pinned ? t('unpin_window') : t('pin_window')}
            className={[
              'p-2 rounded-md transition-colors shrink-0',
              pinned
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        )}
        {/* Tab buttons */}
        <TabBtn active={activeTab === 'history'} onClick={() => setActiveTab('history')} title={t('tab_history')}>
          <ClipboardIcon size={15} />
        </TabBtn>
        <TabBtn active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} title={t('analytics_title')}>
          <BarChart3 size={15} />
        </TabBtn>
        <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} title={t('settings')}>
          <Settings size={15} />
        </TabBtn>
      </header>

      {/* Main */}
      <main className="flex flex-1 overflow-hidden">
        {activeTab === 'settings' && (
          <SettingsPanel onClose={() => setActiveTab('history')} />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsDashboard />
        )}
        {activeTab === 'history' && (
          <ClipboardList
            items={items}
            selectedId={selectedId}
            isLoading={isLoading}
            onCopy={onCopy}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onLoadMore={onLoadMore}
          />
        )}
      </main>
    </div>
  )
}

function TabBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      className={[
        'p-2 rounded-md transition-colors shrink-0',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default App
