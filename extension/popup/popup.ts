// popup.ts — Clipboard Pro extension popup controller

interface ClipboardItem {
  id: number
  type: string
  content: string
  filePath: string
  sourceApp: string
  isPinned: boolean
  createdAt: string
}

interface HistoryResponse {
  items: ClipboardItem[]
  total: number
}

interface PingResponse {
  ok: boolean
  error?: string
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Returns a human-readable relative time string: Xs / Xm / Xh / Xd ago */
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Truncates a string to n characters and appends ellipsis if needed */
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '\u2026' : s
}

/** Sends a message to the background service worker */
async function sendMsg(msg: object): Promise<unknown> {
  return chrome.runtime.sendMessage(msg)
}

// ── DOM references ────────────────────────────────────────────────────────────

const searchInput = document.getElementById('search') as HTMLInputElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const itemsList = document.getElementById('items-list') as HTMLDivElement
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement
const tokenInput = document.getElementById('token-input') as HTMLInputElement
const toggleTokenBtn = document.getElementById('toggle-token') as HTMLButtonElement
const saveTokenBtn = document.getElementById('save-token') as HTMLButtonElement

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(text: string, cls: 'connected' | 'disconnected' | 'loading' | ''): void {
  statusDiv.textContent = text
  statusDiv.className = cls
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message: string): void {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => toast.classList.add('fade-out'), 1200)
  setTimeout(() => toast.remove(), 1500)
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderItems(items: ClipboardItem[]): void {
  itemsList.innerHTML = ''

  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'No clipboard items found.'
    itemsList.appendChild(empty)
    return
  }

  for (const item of items) {
    const div = document.createElement('div')
    div.className = 'item'
    div.dataset['id'] = String(item.id)

    const displayText = item.type === 'image'
      ? '[Image]'
      : truncate(item.content.replace(/\s+/g, ' ').trim(), 150)

    const textEl = document.createElement('div')
    textEl.className = 'item-text'
    textEl.textContent = displayText

    const metaEl = document.createElement('div')
    metaEl.className = 'item-meta'

    const sourceSpan = document.createElement('span')
    sourceSpan.className = 'source-app'
    sourceSpan.textContent = item.sourceApp || 'Unknown'

    const timeSpan = document.createElement('span')
    timeSpan.textContent = timeAgo(item.createdAt)

    if (item.isPinned) {
      const pin = document.createElement('span')
      pin.className = 'item-pinned'
      pin.textContent = '\uD83D\uDCCC '
      textEl.prepend(pin)
    }

    metaEl.appendChild(sourceSpan)
    metaEl.appendChild(timeSpan)
    div.appendChild(textEl)
    div.appendChild(metaEl)

    div.addEventListener('click', () => void handlePaste(item.id))
    itemsList.appendChild(div)
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handlePaste(id: number): Promise<void> {
  const res = (await sendMsg({ action: 'paste', id })) as { ok?: boolean; error?: string }
  if (res?.error) {
    showToast('Error: ' + res.error)
  } else {
    showToast('Copied!')
  }
}

async function loadHistory(): Promise<void> {
  setStatus('Loading\u2026', 'loading')
  try {
    const res = (await sendMsg({ action: 'getHistory', limit: 20, offset: 0 })) as HistoryResponse & { error?: string }
    if (res?.error) {
      setStatus('Error: ' + res.error, 'disconnected')
      return
    }
    setStatus(`${res.total} items`, 'connected')
    renderItems(res.items ?? [])
  } catch (e) {
    setStatus('Failed to load history', 'disconnected')
    console.error(e)
  }
}

// ── Search with 300ms debounce ────────────────────────────────────────────────

let searchTimeout: ReturnType<typeof setTimeout> | null = null

searchInput.addEventListener('input', () => {
  if (searchTimeout !== null) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => void runSearch(), 300)
})

async function runSearch(): Promise<void> {
  const query = searchInput.value.trim()
  if (query === '') {
    void loadHistory()
    return
  }
  setStatus('Searching\u2026', 'loading')
  try {
    const res = (await sendMsg({ action: 'search', query, limit: 20 })) as HistoryResponse & { error?: string }
    if (res?.error) {
      setStatus('Search error', 'disconnected')
      return
    }
    setStatus(`${res.total} results`, 'connected')
    renderItems(res.items ?? [])
  } catch (e) {
    setStatus('Search failed', 'disconnected')
    console.error(e)
  }
}

// ── Settings panel ────────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  const hidden = settingsPanel.hasAttribute('hidden')
  if (hidden) {
    settingsPanel.removeAttribute('hidden')
    void loadSavedToken()
  } else {
    settingsPanel.setAttribute('hidden', '')
  }
})

toggleTokenBtn.addEventListener('click', () => {
  tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password'
})

saveTokenBtn.addEventListener('click', () => {
  const token = tokenInput.value.trim()
  chrome.storage.local.set({ authToken: token }, () => {
    showToast('Token saved!')
    settingsPanel.setAttribute('hidden', '')
    void init()
  })
})

async function loadSavedToken(): Promise<void> {
  const result = await chrome.storage.local.get('authToken')
  tokenInput.value = (result['authToken'] as string) ?? ''
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  setStatus('Connecting\u2026', 'loading')
  itemsList.innerHTML = ''

  try {
    const res = (await sendMsg({ action: 'ping' })) as PingResponse
    if (!res?.ok) {
      setStatus('Clipboard Pro not running', 'disconnected')
      renderItems([])
      return
    }
    await loadHistory()
  } catch (e) {
    setStatus('Cannot reach Clipboard Pro', 'disconnected')
    console.error(e)
  }
}

void init()
