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

// Search filter for advanced search
export interface SearchFilter {
  query: string
  itemType: string  // "" | "text" | "image"
  timeRange: string // "" | "1h" | "24h" | "7d" | "30d"
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
