// service-worker.ts — API client + message handler for Clipboard Pro extension.

interface ClipboardItem {
  id: number
  type: string
  content: string
  filePath: string
  contentHash: string
  sourceApp: string
  isPinned: boolean
  createdAt: string
}

interface HistoryResponse {
  items: ClipboardItem[]
  total: number
}

interface MessageRequest {
  action: string
  limit?: number
  offset?: number
  query?: string
  id?: number
}

interface MessageResponse {
  ok?: boolean
  error?: string
  items?: ClipboardItem[]
  total?: number
}

// API client that communicates with the local Clipboard Pro daemon.
class ClipboardProAPI {
  private baseUrl = 'http://localhost:27843'
  private token = ''

  async loadToken(): Promise<void> {
    const result = await chrome.storage.local.get('authToken')
    this.token = (result['authToken'] as string) ?? ''
  }

  private headers(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/api/v1/ping`, {
        signal: AbortSignal.timeout(2000),
      })
      return r.ok
    } catch {
      return false
    }
  }

  async getHistory(limit: number, offset: number): Promise<HistoryResponse> {
    const r = await fetch(
      `${this.baseUrl}/api/v1/history?limit=${limit}&offset=${offset}`,
      { headers: this.headers(), signal: AbortSignal.timeout(3000) }
    )
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<HistoryResponse>
  }

  async search(query: string, limit: number): Promise<HistoryResponse> {
    const r = await fetch(
      `${this.baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { headers: this.headers(), signal: AbortSignal.timeout(3000) }
    )
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<HistoryResponse>
  }

  async paste(id: number): Promise<void> {
    const r = await fetch(`${this.baseUrl}/api/v1/paste`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(3000),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
  }
}

const api = new ClipboardProAPI()

// Load token once at startup; refresh when storage changes.
api.loadToken()
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['authToken']) {
    api.loadToken()
  }
})

// Listen for messages from the popup and route them to the API.
chrome.runtime.onMessage.addListener(
  (msg: MessageRequest, _sender, sendResponse: (r: MessageResponse | HistoryResponse) => void) => {
    const handle = async (): Promise<MessageResponse | HistoryResponse> => {
      switch (msg.action) {
        case 'ping':
          return { ok: await api.ping() }

        case 'getHistory':
          return api.getHistory(msg.limit ?? 20, msg.offset ?? 0)

        case 'search':
          if (!msg.query) return { items: [], total: 0 }
          return api.search(msg.query, msg.limit ?? 20)

        case 'paste':
          if (msg.id === undefined) return { error: 'missing id' }
          await api.paste(msg.id)
          return { ok: true }

        default:
          return { error: 'unknown action' }
      }
    }

    handle()
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ error: String(e) }))

    // Return true to keep the message channel open for async response.
    return true
  }
)
