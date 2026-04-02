// Clipboard history item returned from Go backend
export interface ClipboardItem {
  id: number
  type: 'text' | 'image'
  content: string
  filePath: string
  contentHash: string
  sourceApp: string
  isPinned: boolean
  createdAt: string
}

// Application configuration
export interface AppConfig {
  port: number
  authToken: string
  retentionDays: number
  maxItems: number
  hotkey: string
  dataDir: string
}
