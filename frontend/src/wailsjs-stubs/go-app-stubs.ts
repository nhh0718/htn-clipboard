// Stub implementations for Wails Go bindings.
// Used when the real wailsjs/go/main/App bindings are not yet generated,
// or when running outside the Wails runtime (e.g. browser dev mode).

import type { ClipboardItem, AppConfig } from '../types/clipboard'

const MOCK_ITEMS: ClipboardItem[] = [
  {
    id: 1,
    type: 'text',
    content: 'Hello from clipboard! This is a sample text entry to demonstrate the UI.',
    filePath: '',
    contentHash: 'hash1',
    sourceApp: 'VSCode',
    isPinned: true,
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 2,
    type: 'text',
    content: 'npm install @tanstack/react-virtual lucide-react',
    filePath: '',
    contentHash: 'hash2',
    sourceApp: 'Terminal',
    isPinned: false,
    createdAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 3,
    type: 'text',
    content: 'https://github.com/wailsapp/wails',
    filePath: '',
    contentHash: 'hash3',
    sourceApp: 'Chrome',
    isPinned: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 4,
    type: 'text',
    content: `const handler = async (req, res) => {\n  const data = await fetchData()\n  res.json(data)\n}`,
    filePath: '',
    contentHash: 'hash4',
    sourceApp: 'VSCode',
    isPinned: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 5,
    type: 'image',
    content: '',
    filePath: 'screenshots/screenshot-001.png',
    contentHash: 'hash5',
    sourceApp: 'Snipping Tool',
    isPinned: false,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
]

const MOCK_CONFIG: AppConfig = {
  port: 54321,
  authToken: 'tok_abc123xyz789',
  retentionDays: 30,
  maxItems: 500,
  hotkey: 'Ctrl+Shift+V',
  dataDir: 'C:\\Users\\User\\AppData\\Local\\ClipboardPro',
}

export function GetHistory(limit: number, offset: number): Promise<ClipboardItem[]> {
  const slice = MOCK_ITEMS.slice(offset, offset + limit)
  return Promise.resolve(slice)
}

export function Search(query: string): Promise<ClipboardItem[]> {
  const q = query.toLowerCase()
  const results = MOCK_ITEMS.filter(
    (item) =>
      item.content.toLowerCase().includes(q) ||
      item.sourceApp.toLowerCase().includes(q)
  )
  return Promise.resolve(results)
}

export function CopyItem(id: number): Promise<void> {
  console.log('[stub] CopyItem', id)
  return Promise.resolve()
}

export function DeleteItem(id: number): Promise<void> {
  console.log('[stub] DeleteItem', id)
  return Promise.resolve()
}

export function TogglePin(id: number): Promise<void> {
  console.log('[stub] TogglePin', id)
  return Promise.resolve()
}

export function GetConfig(): Promise<AppConfig> {
  return Promise.resolve({ ...MOCK_CONFIG })
}

export function SaveConfig(config: AppConfig): Promise<void> {
  console.log('[stub] SaveConfig', config)
  return Promise.resolve()
}
