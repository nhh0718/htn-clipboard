# Codebase Summary — Clipboard Pro

## Go Backend Structure

### Configuration & Storage
- **`internal/config/config.go`** — Load/save config, default values (port, token, retention days)
- **`internal/storage/models.go`** — GORM ClipboardItem model (text/image, hash, metadata)
- **`internal/storage/db.go`** — SQLite init, WAL mode, FTS5 virtual table + triggers
- **`internal/storage/repository.go`** — CRUD operations (Save, GetAll, Search, Delete, TogglePin, DeleteOlderThan)

### Core Features
- **`internal/clipboard/monitor.go`** — Goroutine watching clipboard, SHA256 dedup, image file handling
- **`internal/server/api.go`** — HTTP API server (4 routes, auth + CORS middleware)
- **`app.go`** — Wails lifecycle hooks (startup, shutdown), Wails-bound methods, global hotkey, systray
- **`main.go`** — App entry point, Wails configuration

## React Frontend Structure

### Components
- **`SearchBar.tsx`** — Text input with 300ms debounce, calls backend Search()
- **`ClipboardItem.tsx`** — Card displaying text/image, copy/pin/delete actions
- **`ClipboardList.tsx`** — Virtual scroll list using @tanstack/react-virtual
- **`SettingsPanel.tsx`** — Config read/write (retention, max items, token display)

### Integration
- **`App.tsx`** — Main app container, Wails bindings, event listeners (clipboard:new), keyboard navigation
- **`types/clipboard.ts`** — TypeScript interfaces matching Go models (ClipboardItem, Config)

## Browser Extension Structure

### Extension Files
- **`extension/manifest.json`** — Chrome MV3 config (permissions, API endpoints, icons)
- **`extension/background/service-worker.ts`** — API client wrapper, message handler, retry logic
- **`extension/popup/popup.html`** — Popup UI (search, items list, settings toggle)
- **`extension/popup/popup.ts`** — Load history, search, copy, token management
- **`extension/popup/popup.css`** — Dark theme styles

## Key Design Patterns

**Repository Pattern:** All storage queries through `repository.go` interface
**Middleware Chain:** Auth + CORS middleware on HTTP handlers
**Event-Driven:** Wails runtime events for real-time UI updates
**Message Passing:** Extension communicates via chrome.runtime.onMessage

## File Statistics

- **Go files:** 8 core modules (config, storage, clipboard, server, app, main)
- **React components:** 4 main components + App container
- **Extension files:** 5 core files (manifest, service worker, popup)
- **Total lines of code:** ~3000 (backend + frontend + extension)

## Build Outputs

- **Desktop:** Single executable (Windows .exe, macOS .app)
- **Extension:** Bundled in dist/ folder for Chrome load
- **CI/CD:** GitHub Actions (matrix builds + release automation)
