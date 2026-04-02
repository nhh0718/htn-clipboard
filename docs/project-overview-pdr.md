# Clipboard Pro — Project Overview

## Project Summary

**Clipboard Pro** is a professional cross-platform clipboard history manager combining a desktop application with a browser extension.

- **Type:** Hybrid system — Wails v2 desktop app (Go + React/TS) + Chrome MV3 extension
- **Platform:** Windows & macOS (Linux future)
- **Storage:** Local-only SQLite with full-text search (FTS5)
- **Privacy-First:** All data stored locally, no cloud sync

## Core Architecture

```
Wails Desktop App (Go + React frontend)
├── Clipboard Monitor (goroutine) → SQLite + disk storage
├── React UI (search, history, settings, tray)
├── Global Hotkey (Ctrl+Shift+V)
└── Local HTTP API (localhost:27843, Bearer token auth)
       ↓
Browser Extension (Chrome MV3)
└── Popup UI + service worker client
```

## Technology Stack

| Layer | Tech | Details |
|-------|------|---------|
| Desktop Framework | Wails v2 | Go backend + web UI, ~15MB binary |
| Clipboard Library | golang.design/x/clipboard | Text + image support, change detection |
| Global Hotkey | robotn/gohook | Cross-platform hotkey registration |
| System Tray | getlantern/systray | Wails app window management |
| Storage | SQLite + go-sqlite3 | FTS5 extension for search |
| ORM | GORM | Lightweight database abstraction |
| Frontend | React + TypeScript | Tailwind CSS + shadcn/ui components |
| Extension | Chrome MV3 | TypeScript service worker + popup |

## Data Storage

- **Config:** `~/.clipboard-pro/config.json` (port, token, settings)
- **Database:** `~/.clipboard-pro/data/clipboard.db` (WAL mode for concurrent access)
- **Images:** `~/.clipboard-pro/data/items/{uuid}.png` (referenced in DB)

## HTTP API (localhost:27843)

- `GET /api/v1/ping` — health check
- `GET /api/v1/history?limit=20&offset=0` — paginated history
- `GET /api/v1/search?q=keyword` — FTS5 search
- `POST /api/v1/paste` — copy item to clipboard
- Auth: `Authorization: Bearer {token}`

## Key Features

- Capture text + image clipboard changes within 1 second
- Full-text search <100ms for 1000 items
- Pin important items
- Auto-cleanup unpinned items (configurable retention)
- System tray + global hotkey for quick access
- Dark theme UI (Tailwind + shadcn/ui)
- Browser extension for quick access from web

## Build Requirements

- Go 1.21+
- Node.js 18+
- Wails CLI
- GCC (for CGO: robotn/gohook, sqlite3)

## Build Command

```bash
CGO_ENABLED=1 wails build -tags fts5
```

## Success Metrics

- Clipboard capture latency: <1s
- Search performance: <100ms for 1000 items
- Memory usage: <50MB idle
- Binary size: <20MB
