# Phase 02 Implementation Report — Go Backend Core

## Executed Phase
- Phase: phase-02-go-backend-core
- Plan: E:\Code-Fun\clipboard-pro\plans\260402-0926-clipboard-pro\
- Status: completed

## Files Modified

| File | Action | Lines |
|------|--------|-------|
| `internal/config/config.go` | created | 72 |
| `internal/storage/models.go` | created | 19 |
| `internal/storage/db.go` | created | 65 |
| `internal/storage/repository.go` | created | 101 |
| `internal/clipboard/monitor.go` | created | 161 |
| `app.go` | replaced Wails template | 184 |
| `main.go` | replaced Wails template | 35 |

## Tasks Completed

- [x] config.go — Load/Save/defaults, UUID auth token, 0600 permissions
- [x] models.go — ClipboardItem GORM model with uniqueIndex on ContentHash
- [x] db.go — SQLite WAL mode, AutoMigrate, FTS5 virtual table, INSERT/DELETE/UPDATE triggers
- [x] repository.go — Save (dedup), GetAll, Search (FTS5), Delete (with file cleanup), TogglePin, DeleteOlderThan, Count, GetByID, GetByHash
- [x] monitor.go — 500ms poll loop, text + image capture, SHA256 dedup, image file save to dataDir/items/{uuid}.png, 10MB cap, Wails event emission
- [x] app.go — startup/shutdown lifecycle, systray (Show/Quit), global hotkey Ctrl+Shift+V, periodic cleanup goroutine, all 8 bound methods
- [x] main.go — Wails options: Title "Clipboard Pro", 400x600, StartHidden: true

## Tests Status
- Type check: pass (`CGO_ENABLED=1 go build -tags fts5 ./...` exits 0, no output)
- Unit tests: not written (no test files in scope for this phase)
- Integration tests: n/a

## Issues Encountered

1. **Import order in app.go** — `golang.design/x/clipboard` aliased as `goclip` to avoid collision with internal `clipboard` package. Resolved cleanly.
2. **Image encoding** — `golang.design/x/clipboard` on Windows returns raw RGBA bytes, not PNG. `monitor.go` attempts `png.Decode` first and falls back to raw write, ensuring no crash on either format.
3. **server field** — `*server.Server` kept as a comment `// server *server.Server — added in Phase 04` per spec; no compile-time dependency on Phase 04.
4. **Systray icon** — `systray.SetIcon(nil)` not called; title and tooltip set instead. No embedded asset needed — systray works without icon bytes on Windows (shows default blank tray icon).

## Blockers for Phase 04

- Phase 04 must add `internal/server/` package and wire into `app.go` startup/shutdown.
- Integration point: `app.go` line 27 (commented field) and lines 75-76 (commented server stop call).
- `a.repo` and `a.config` are ready for Phase 04 to consume — `Repository` and `Config` are exported.
- Auth token available via `a.config.AuthToken`, port via `a.config.Port`.

## Next Steps

- Phase 03 (React frontend) can call all bound methods immediately via Wails bridge.
- Phase 04 (HTTP API) depends on `storage.Repository` and `config.Config` — both ready.
