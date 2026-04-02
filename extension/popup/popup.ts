// popup.ts — Clipboard Pro extension popup controller
// UI synced with desktop app: badges, source app, actions (copy/pin/delete), filters, images

interface CbItem {
  id: number
  type: string
  content: string
  filePath: string
  sourceApp: string
  isPinned: boolean
  createdAt: string
}

interface CbHistoryResponse {
  items: CbItem[]
  total: number
}

interface CbPingResponse {
  ok: boolean
  error?: string
}

// ── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function escapeHtml(s: string): string {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

async function sendMsg(msg: object): Promise<unknown> {
  return chrome.runtime.sendMessage(msg)
}

// SVG icon strings (matching lucide-react icons used in the app)
const ICON = {
  copy: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  pin: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>',
  trash: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
}

// ── State ────────────────────────────────────────────────────────────────────

let currentFilter = { type: '', time: '' }
let currentItems: CbItem[] = []

// ── DOM references ────────────────────────────────────────────────────────────

const searchInput = document.getElementById('search') as HTMLInputElement
const statusDiv = document.getElementById('status') as HTMLDivElement
const itemsList = document.getElementById('items-list') as HTMLDivElement
const filtersDiv = document.getElementById('filters') as HTMLDivElement
const filterBtn = document.getElementById('filter-btn') as HTMLButtonElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement
const tokenInput = document.getElementById('token-input') as HTMLInputElement
const toggleTokenBtn = document.getElementById('toggle-token') as HTMLButtonElement
const saveTokenBtn = document.getElementById('save-token') as HTMLButtonElement

// ── Status / Toast ────────────────────────────────────────────────────────────

function setStatus(text: string, cls: 'connected' | 'disconnected' | 'loading' | ''): void {
  statusDiv.textContent = text
  statusDiv.className = cls
}

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

// ── Render — same layout as app ClipboardItem ────────────────────────────────

function renderItems(items: CbItem[]): void {
  currentItems = items
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
    div.className = 'item' + (item.isPinned ? ' pinned' : '')

    // ── Row 1: [badge] [source flex-1] [actions] [time] ──
    const header = document.createElement('div')
    header.className = 'item-header'

    // Badge
    const badge = document.createElement('span')
    badge.className = `badge ${item.type === 'image' ? 'image' : 'text'}`
    badge.textContent = item.type === 'image' ? 'img' : 'txt'
    header.appendChild(badge)

    // Source app
    const source = document.createElement('span')
    source.className = 'source-app'
    source.textContent = item.sourceApp || 'Unknown'
    header.appendChild(source)

    // Action buttons
    const actions = document.createElement('div')
    actions.className = 'item-actions'

    // Copy
    const copyBtn = createActionBtn(ICON.copy, 'Copy', () => handleCopy(item.id, copyBtn))
    actions.appendChild(copyBtn)

    // Pin
    const pinBtn = createActionBtn(ICON.pin, item.isPinned ? 'Unpin' : 'Pin', () => handlePin(item.id))
    if (item.isPinned) pinBtn.classList.add('pin-active')
    actions.appendChild(pinBtn)

    // Delete
    const delBtn = createActionBtn(ICON.trash, 'Delete', () => handleDelete(item.id))
    delBtn.classList.add('delete')
    actions.appendChild(delBtn)

    header.appendChild(actions)

    // Time
    const time = document.createElement('span')
    time.className = 'item-time'
    time.textContent = timeAgo(item.createdAt)
    header.appendChild(time)

    div.appendChild(header)

    // ── Row 2: content or image ──
    if (item.type === 'image') {
      const img = document.createElement('img')
      img.className = 'item-image'
      img.src = `http://localhost:27843/api/v1/image/${item.id}`
      img.alt = 'Clipboard image'
      img.onerror = () => { img.style.display = 'none' }
      div.appendChild(img)
    } else {
      const textEl = document.createElement('div')
      textEl.className = 'item-text'
      textEl.textContent = item.content.slice(0, 300) + (item.content.length > 300 ? '\u2026' : '')
      div.appendChild(textEl)
    }

    // Click entire item = copy
    div.addEventListener('click', (e) => {
      // Don't trigger if clicking action buttons
      if ((e.target as HTMLElement).closest('.item-actions')) return
      handleCopy(item.id, copyBtn)
    })

    itemsList.appendChild(div)
  }
}

function createActionBtn(iconHtml: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'action-btn'
  btn.title = title
  btn.innerHTML = iconHtml
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return btn
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleCopy(id: number, btn?: HTMLButtonElement): Promise<void> {
  const res = (await sendMsg({ action: 'paste', id })) as { ok?: boolean; error?: string }
  if (res?.error) {
    showToast('Error: ' + res.error)
  } else {
    // Show "Copied!" on the button briefly
    if (btn) {
      const orig = btn.innerHTML
      btn.innerHTML = '<span class="copied-label">Copied!</span>'
      setTimeout(() => { btn.innerHTML = orig }, 1200)
    }
    showToast('Copied!')
  }
}

async function handlePin(id: number): Promise<void> {
  const res = (await sendMsg({ action: 'pin', id })) as { ok?: boolean; error?: string }
  if (res?.error) {
    showToast('Error: ' + res.error)
  } else {
    // Refresh list to reflect pin state change + reorder
    void fetchAndRender()
  }
}

async function handleDelete(id: number): Promise<void> {
  const res = (await sendMsg({ action: 'delete', id })) as { ok?: boolean; error?: string }
  if (res?.error) {
    showToast('Error: ' + res.error)
  } else {
    showToast('Deleted')
    // Remove from DOM immediately
    currentItems = currentItems.filter(i => i.id !== id)
    renderItems(currentItems)
  }
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchAndRender(): Promise<void> {
  const query = searchInput.value.trim()
  const hasFilter = query || currentFilter.type || currentFilter.time

  setStatus(hasFilter ? 'Searching\u2026' : 'Loading\u2026', 'loading')

  try {
    let res: CbHistoryResponse & { error?: string }

    if (hasFilter) {
      res = (await sendMsg({
        action: 'search',
        query,
        type: currentFilter.type,
        time: currentFilter.time,
        limit: 30,
      })) as CbHistoryResponse & { error?: string }
    } else {
      res = (await sendMsg({ action: 'getHistory', limit: 30, offset: 0 })) as CbHistoryResponse & { error?: string }
    }

    if (res?.error) {
      setStatus('Error: ' + res.error, 'disconnected')
      return
    }

    setStatus(`${res.total} items`, 'connected')
    renderItems(res.items ?? [])
  } catch (e) {
    setStatus('Failed to load', 'disconnected')
    console.error(e)
  }
}

// ── Search with 300ms debounce ────────────────────────────────────────────────

let searchTimeout: ReturnType<typeof setTimeout> | null = null

searchInput.addEventListener('input', () => {
  if (searchTimeout !== null) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => void fetchAndRender(), 300)
  updateClearBtn()
})

// ── Filter chips ────────────────────────────────────────────────────────────

filterBtn.addEventListener('click', () => {
  filtersDiv.classList.toggle('hidden')
  filterBtn.classList.toggle('active', !filtersDiv.classList.contains('hidden'))
})

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const el = chip as HTMLElement
    const filterGroup = el.dataset['filter']!
    const value = el.dataset['value']!

    // Update active state in this group
    document.querySelectorAll(`.chip[data-filter="${filterGroup}"]`).forEach(c => c.classList.remove('active'))
    el.classList.add('active')

    if (filterGroup === 'type') currentFilter.type = value
    if (filterGroup === 'time') currentFilter.time = value

    updateClearBtn()
    void fetchAndRender()
  })
})

// ── Clear button ────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  searchInput.value = ''
  currentFilter = { type: '', time: '' }
  // Reset chip UI
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', (c as HTMLElement).dataset['value'] === '')
  })
  filtersDiv.classList.add('hidden')
  filterBtn.classList.remove('active')
  updateClearBtn()
  void fetchAndRender()
  searchInput.focus()
})

function updateClearBtn(): void {
  const hasAny = searchInput.value.trim() || currentFilter.type || currentFilter.time
  clearBtn.classList.toggle('hidden', !hasAny)
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
    const res = (await sendMsg({ action: 'ping' })) as CbPingResponse
    if (!res?.ok) {
      setStatus('Clipboard Pro not running', 'disconnected')
      renderItems([])
      return
    }
    await fetchAndRender()
  } catch (e) {
    setStatus('Cannot reach Clipboard Pro', 'disconnected')
    console.error(e)
  }
}

void init()
