# Phase 02: Go Backend Core

## Context Links

- [Plan Overview](plan.md)
- [Architecture Brainstorm](../reports/brainstorm-260402-0926-clipboard-pro-architecture.md)
- [Technical Research](../reports/researcher-260402-0934-clipboard-manager-research.md)

## Overview

- **Priority:** P1 — core app logic
- **Status:** completed
- **Effort:** 3h
- **Blocked by:** Phase 01
- **Description:** Implement config, SQLite storage, clipboard monitor, global hotkey, system tray, and Wails bindings.

## Key Insights

- `golang.design/x/clipboard` supports text+image with change detection on Windows/macOS
- Images stored as files on disk, metadata in SQLite — proven pattern from Maccy/Clipy
- SQLite WAL mode required for concurrent reads from app + HTTP server
- FTS5 needs sync triggers (INSERT/DELETE) to keep virtual table in sync
- robotn/gohook requires CGO_ENABLED=1

## Requirements

### Functional
- Capture text and image clipboard changes within 1s
- Store items in SQLite with SHA256 dedup
- FTS5 full-text search on text content
- Pin/unpin items
- Auto-cleanup items older than configurable days
- Global hotkey toggles app window
- System tray icon with Show/Hide and Quit

### Non-functional
- Memory <50MB idle
- Search <100ms for 1000 items
- No data loss on crash (WAL mode)

## Architecture

```
app.go (Wails lifecycle)
├── clipboard.Monitor (goroutine) → storage.Repository.Save()
├── gohook (global hotkey) → runtime.WindowToggle()
├── systray (system tray) → Show/Hide/Quit
└── Wails bindings → frontend calls
```

## Related Code Files

### Create
- `internal/config/config.go`
- `internal/storage/models.go`
- `internal/storage/db.go`
- `internal/storage/repository.go`
- `internal/clipboard/monitor.go`
- `app.go` (modify from Wails template)
- `main.go` (modify from Wails template)

## Implementation Steps

### Step 1: Config (`internal/config/config.go`)

1. Define `Config` struct:
   ```go
   type Config struct {
       Port          int    `json:"port"`           // default 27843
       AuthToken     string `json:"authToken"`      // random UUID
       RetentionDays int    `json:"retentionDays"`  // default 30
       MaxItems      int    `json:"maxItems"`       // default 1000
       Hotkey        string `json:"hotkey"`          // "ctrl+shift+v"
       DataDir       string `json:"dataDir"`         // ~/.clipboard-pro/data
   }
   ```
2. `Load()` — read `~/.clipboard-pro/config.json`, create with defaults if missing
3. `Save(config)` — write config back to file
4. Generate random UUID for `AuthToken` on first run via `github.com/google/uuid`

### Step 2: Storage Models (`internal/storage/models.go`)

1. Define GORM model:
   ```go
   type ClipboardItem struct {
       ID          uint      `gorm:"primaryKey" json:"id"`
       Type        string    `gorm:"not null" json:"type"`        // "text" or "image"
       Content     string    `json:"content"`                      // text content
       FilePath    string    `json:"filePath"`                     // image path (relative)
       ContentHash string    `gorm:"uniqueIndex;not null" json:"contentHash"`
       SourceApp   string    `json:"sourceApp"`
       IsPinned    bool      `gorm:"default:false" json:"isPinned"`
       CreatedAt   time.Time `json:"createdAt"`
   }
   ```

### Step 3: Database Init (`internal/storage/db.go`)

1. `InitDB(dataDir string) (*gorm.DB, error)`:
   - Open SQLite: `dataDir/clipboard.db` with WAL mode pragma
   - DSN: `file:clipboard.db?_journal_mode=WAL&_foreign_keys=on`
   - `db.AutoMigrate(&ClipboardItem{})`
2. Create FTS5 virtual table via raw SQL:
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
       content, content='clipboard_items', content_rowid='id'
   );
   ```
3. Create sync triggers (INSERT + DELETE) via raw SQL
4. Build tag: add `// go:build cgo && fts5` or use `-tags fts5` in build

### Step 4: Repository (`internal/storage/repository.go`)

1. `Repository` struct wrapping `*gorm.DB`
2. Methods:
   - `Save(item *ClipboardItem) error` — check hash exists first (dedup), insert if new
   - `GetAll(limit, offset int) ([]ClipboardItem, error)` — order by `created_at DESC`
   - `Search(query string, limit int) ([]ClipboardItem, error)` — FTS5 MATCH query
   - `Delete(id uint) error`
   - `TogglePin(id uint) error` — flip `is_pinned`
   - `DeleteOlderThan(days int) error` — delete where `created_at < now - days` AND `is_pinned = false`
   - `Count() (int64, error)`
   - `GetByHash(hash string) (*ClipboardItem, error)` — for dedup check

### Step 5: Clipboard Monitor (`internal/clipboard/monitor.go`)

1. `Monitor` struct with `repo *storage.Repository`, `dataDir string`, `lastHash string`
2. `Start(ctx context.Context)` method:
   - Launch goroutine watching clipboard via `golang.design/x/clipboard`
   - On new text: compute SHA256, skip if == lastHash, create ClipboardItem, save
   - On new image: save bytes to `dataDir/items/{uuid}.png`, compute SHA256, save metadata
3. Image handling:
   - Skip images >10MB
   - Create `dataDir/items/` directory if not exists
   - Use `github.com/google/uuid` for filenames
4. Emit Wails runtime event `clipboard:new` with item JSON on each new capture

### Step 6: App Bindings (`app.go`)

1. Modify Wails-generated `app.go`:
   - `startup(ctx)`: init config, init DB, start clipboard monitor, start HTTP server, register hotkey
   - `shutdown(ctx)`: cleanup goroutines, close DB
2. Expose bound methods:
   - `GetHistory(limit, offset int) []ClipboardItem`
   - `Search(query string) []ClipboardItem`
   - `CopyItem(id int) error` — read item, write to clipboard
   - `DeleteItem(id int) error`
   - `TogglePin(id int) error`
   - `GetConfig() Config`
   - `SaveConfig(config Config) error`
3. Global hotkey registration:
   - Use `robotn/gohook` to listen for Ctrl+Shift+V
   - On trigger: `runtime.WindowShow()` or `runtime.WindowHide()` toggle
4. System tray:
   - Init `systray` with icon, tooltip "Clipboard Pro"
   - Menu items: "Show/Hide" (toggle window), separator, "Quit" (exit app)
   - On window close button: `runtime.WindowHide()` instead of quit

### Step 7: Main Entry (`main.go`)

1. Modify Wails-generated `main.go`:
   - Create `App` instance
   - Configure `wails.Run()` with options:
     - `Title: "Clipboard Pro"`
     - `Width: 400, Height: 600`
     - `StartHidden: true` (start in tray)
     - `OnStartup: app.startup`
     - `OnShutdown: app.shutdown`
     - `Bind: [app]`

## Todo List

- [x] Implement config.go — load/save/defaults
- [x] Implement models.go — ClipboardItem GORM model
- [x] Implement db.go — SQLite init, WAL, FTS5, triggers
- [x] Implement repository.go — Save, GetAll, Search, Delete, TogglePin, DeleteOlderThan
- [x] Implement monitor.go — clipboard watcher goroutine
- [x] Image capture — save to disk, SHA256 hash
- [x] Text capture — SHA256 hash, dedup
- [x] Wails event emission (clipboard:new)
- [x] app.go — startup/shutdown lifecycle
- [x] app.go — Wails-bound methods (GetHistory, Search, CopyItem, etc.)
- [x] Global hotkey registration (Ctrl+Shift+V)
- [x] System tray icon + context menu
- [x] Auto-cleanup goroutine (periodic, e.g., every hour)
- [ ] Verify: `wails dev` runs with backend functional — deferred to full integration after Phase 03

## Success Criteria

- Clipboard text copied → appears in DB within 1s
- Clipboard image copied → file saved to disk, metadata in DB
- Duplicate consecutive copies not stored
- `Search("keyword")` returns matching items via FTS5
- Global hotkey toggles window visibility
- System tray shows icon with working menu
- Auto-cleanup removes old unpinned items

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| golang.design/x/clipboard Windows edge cases | Medium | Test early; fallback to 500ms polling with atotto/clipboard |
| robotn/gohook CGO build failure | Medium | Ensure GCC (TDM-GCC) installed; document in README |
| FTS5 trigger sync issues | Low | Test with concurrent inserts; WAL mode helps |
| Image storage growth | Medium | Auto-cleanup + 10MB size cap per image |
| systray conflict with Wails window management | Medium | Test on Windows first; may need to use Wails-native tray if available |

## Security Considerations

- Auth token stored in `~/.clipboard-pro/config.json` with 0600 permissions
- Clipboard data stored locally only — no network transmission
- Image files inherit user filesystem permissions

## Next Steps

- Phase 04 (HTTP API) depends on repository being ready
- Phase 03 (Frontend) can call bound methods once exposed
