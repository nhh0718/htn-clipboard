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

// Health check status from backend
export interface HealthStatus {
  status: string
  version: string
  uptime: string
  dbItems: number
  apiPort: number
  monitor: boolean
  autoStart: boolean
}

// Update check result from GitHub Releases API
export interface UpdateInfo {
  available: boolean
  current: string
  latest: string
  downloadURL: string
  releaseURL: string
  releaseNote: string
}

// Application configuration
export interface AppConfig {
  port: number
  authToken: string
  retentionDays: number
  maxItems: number
  hotkey: string
  dataDir: string
  autoStart: boolean
}
