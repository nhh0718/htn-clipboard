import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings } from 'lucide-react'
import './App.css'
import { SearchBar } from './components/SearchBar'
import { ClipboardList } from './components/ClipboardList'
import { SettingsPanel } from './components/SettingsPanel'
import type { ClipboardItem } from './types/clipboard'
import { GetHistory, Search, CopyItem, DeleteItem, TogglePin, EventsOn, EventsOff } from './services/wails-bridge'

const PAGE_SIZE = 50

// Apply dark mode to the document root once
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark')
}

function App() {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  // Track current query in a ref so event callbacks stay stable
  const queryRef = useRef(query)
  queryRef.current = query

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async (reset = false) => {
    setIsLoading(true)
    try {
      const currentOffset = reset ? 0 : offset
      const page = await GetHistory(PAGE_SIZE, currentOffset)
      setItems((prev) => reset ? page : [...prev, ...page])
      setOffset(currentOffset + page.length)
      setHasMore(page.length === PAGE_SIZE)
    } catch (err) {
      console.error('Failed to load clipboard history:', err)
    } finally {
      setIsLoading(false)
    }
  }, [offset])

  // Initial load
  useEffect(() => {
    loadHistory(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Wails event: new clipboard item captured by Go backend ─────────────────

  useEffect(() => {
    const handler = (item: ClipboardItem) => {
      // Only prepend when not in search mode
      if (!queryRef.current) {
        setItems((prev) => [item, ...prev])
        setOffset((o) => o + 1)
      }
    }
    EventsOn('clipboard:new', handler as (...data: unknown[]) => void)
    return () => EventsOff('clipboard:new')
  }, [])

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    setIsLoading(true)
    try {
      if (q.trim() === '') {
        // Reset to full history
        const page = await GetHistory(PAGE_SIZE, 0)
        setItems(page)
        setOffset(page.length)
        setHasMore(page.length === PAGE_SIZE)
      } else {
        const results = await Search(q)
        setItems(results)
        setOffset(results.length)
        setHasMore(false)
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Infinite scroll ─────────────────────────────────────────────────────────

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore && !query) {
      loadHistory(false)
    }
  }, [isLoading, hasMore, query, loadHistory])

  // ── Item actions ────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async (id: number) => {
    try {
      await CopyItem(id)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    try {
      await DeleteItem(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }, [selectedId])

  const handleTogglePin = useCallback(async (id: number) => {
    try {
      await TogglePin(id)
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isPinned: !item.isPinned } : item
        )
      )
    } catch (err) {
      console.error('Toggle pin failed:', err)
    }
  }, [])

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (showSettings) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedId((cur) => {
          if (items.length === 0) return null
          const idx = items.findIndex((i) => i.id === cur)
          if (e.key === 'ArrowDown') {
            const next = idx < items.length - 1 ? idx + 1 : 0
            return items[next].id
          } else {
            const prev = idx > 0 ? idx - 1 : items.length - 1
            return items[prev].id
          }
        })
      }

      if (e.key === 'Enter' && selectedId !== null) {
        handleCopy(selectedId)
      }

      if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, selectedId, showSettings, handleCopy])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <SearchBar onSearch={handleSearch} isSearching={isLoading} />
        <button
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Open settings"
          className={[
            'p-2 rounded-md transition-colors shrink-0',
            showSettings
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ].join(' ')}
        >
          <Settings size={16} />
        </button>
      </header>

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden">
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        ) : (
          <ClipboardList
            items={items}
            selectedId={selectedId}
            isLoading={isLoading}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onLoadMore={handleLoadMore}
          />
        )}
      </main>
    </div>
  )
}

export default App
