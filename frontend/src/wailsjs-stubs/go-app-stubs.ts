// HTTP API fallback — used when running in a browser (not inside Wails WebView).
// Calls the same Go backend via the local HTTP API on port 27843.

import type { ClipboardItem, AppConfig, SearchFilter, HealthStatus } from '../types/clipboard'

// Same-origin: frontend is served from the API server, so use relative URLs.
const API_BASE = ''

function getToken(): string {
  return localStorage.getItem('clipboard-pro-token') ?? ''
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers(), ...init?.headers } })
  if (!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}

export async function GetHistory(limit: number, offset: number): Promise<ClipboardItem[]> {
  const data = await apiFetch<{ items: ClipboardItem[] }>(`/api/v1/history?limit=${limit}&offset=${offset}`)
  return data.items ?? []
}

export async function Search(filter: SearchFilter): Promise<ClipboardItem[]> {
  const params = new URLSearchParams()
  if (filter.query) params.set('q', filter.query)
  if (filter.itemType) params.set('type', filter.itemType)
  if (filter.timeRange) params.set('time', filter.timeRange)
  params.set('limit', '100')
  const data = await apiFetch<{ items: ClipboardItem[] }>(`/api/v1/search?${params}`)
  return data.items ?? []
}

export async function CopyItem(id: number): Promise<void> {
  await apiFetch(`/api/v1/paste`, { method: 'POST', body: JSON.stringify({ id }) })
}

export async function DeleteItem(id: number): Promise<void> {
  await apiFetch('/api/v1/delete', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function TogglePin(id: number): Promise<void> {
  await apiFetch('/api/v1/pin', { method: 'POST', body: JSON.stringify({ id }) })
}

export async function GetConfig(): Promise<AppConfig> {
  // Config is not exposed via HTTP API — return sensible defaults
  return {
    port: 27843,
    authToken: getToken(),
    retentionDays: 30,
    maxItems: 1000,
    hotkey: 'Ctrl+Shift+V',
    dataDir: '',
    autoStart: false,
  }
}

export async function SaveConfig(_config: AppConfig): Promise<void> {
  console.warn('[browser] SaveConfig not available via HTTP API')
}

export async function GetHealth(): Promise<HealthStatus> {
  const data = await apiFetch<{ status: string; version: string }>('/api/v1/ping')
  return {
    status: data.status === 'ok' ? 'running' : 'error',
    uptime: '',
    dbItems: 0,
    apiPort: 27843,
    monitor: data.status === 'ok',
    autoStart: false,
  }
}
