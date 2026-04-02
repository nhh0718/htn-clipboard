# Brainstorm Report: Clipboard Pro — Cross-Platform Clipboard History Manager
**Date:** 2026-04-02 | **Status:** Finalized

---

## Problem Statement

Build a professional cross-platform clipboard history manager with:
- Desktop app (Windows + macOS) as the core
- Browser extension connecting to desktop via local API
- Text + image history, search, re-paste
- Local-only storage (privacy-first), open source on GitHub

---

## Evaluated Approaches

### App Type
| Option | Verdict |
|--------|---------|
| Browser Extension only | ❌ Cannot access OS clipboard fully, no image support |
| Desktop App only | ✅ Full clipboard access, system tray, hotkeys |
| Desktop App + Browser Extension (Hybrid) | ✅✅ Best of both — desktop is core, extension connects via local API |

**Decision: Hybrid** — Desktop app handles all clipboard monitoring, extension is a thin client.

### IPC (Desktop ↔ Extension)
| Option | Verdict |
|--------|---------|
| Native Messaging | Better security, complex setup, requires OS registration |
| Localhost HTTP + auth token | Simpler, debuggable with curl/DevTools, good enough for open source |

**Decision: Localhost HTTP for MVP** — random UUID token, configurable port (default: 27843).

### Storage
| Option | Verdict |
|--------|---------|
| SQLite BLOB for images | ❌ Bloats DB, slow queries at scale |
| File reference (images on disk) | ✅ Fast queries, easy dedup, follows Maccy/Clipy pattern |
| Cloud sync | ❌ Out of scope for v1, privacy concern |

**Decision: SQLite + file references** — metadata in DB, images in `~/.clipboard-pro/data/items/`

---

## Final Architecture

```
┌─────────────────────────────────────────────────┐
│              Wails Desktop App (Go)             │
│                                                 │
│  ┌─────────────┐    ┌──────────────────────┐   │
│  │  Clipboard  │    │   React Frontend     │   │
│  │  Monitor    │───▶│   system tray UI     │   │
│  │  goroutine  │    │   Search + History   │   │
│  └─────────────┘    └──────────────────────┘   │
│         │                                       │
│  ┌──────▼──────┐    ┌──────────────────────┐   │
│  │   SQLite    │    │  Local HTTP API      │   │
│  │  + images/  │    │  localhost:27843     │   │
│  │  (files)    │    │  + auth token        │   │
│  └─────────────┘    └──────────┬───────────┘   │
└─────────────────────────────────┼───────────────┘
                                  │
                    ┌─────────────▼───────────┐
                    │   Browser Extension     │
                    │   Chrome MV3, TS        │
                    │   popup + background    │
                    └─────────────────────────┘
```

## Tech Stack

| Layer | Tech | Reason |
|-------|------|--------|
| Desktop framework | Wails v2 | Go backend + Web UI, ~10MB binary |
| Clipboard monitoring | `golang.design/x/clipboard` | Only lib with text+image + change detection |
| Global hotkey | `github.com/robotn/gohook` | Cross-platform, CGO-based |
| System tray | `github.com/getlantern/systray` | Wails built-in + systray for fallback |
| Storage | SQLite + `github.com/mattn/go-sqlite3` | Local, FTS5 search, zero-config |
| ORM | GORM | Standard Go ORM |
| Notifications | `github.com/gen2brain/beeep` | Cross-platform OS notifications |
| Frontend | React + TypeScript + Tailwind + shadcn/ui | Best ecosystem |
| Browser extension | Chrome MV3 + TypeScript | Standard, future-proof |

## Data Model

```sql
CREATE TABLE clipboard_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,          -- 'text', 'image'
  content      TEXT,                   -- text content
  file_path    TEXT,                   -- image file path (relative)
  content_hash TEXT NOT NULL UNIQUE,   -- SHA256 for dedup
  source_app   TEXT,
  is_pinned    BOOLEAN DEFAULT FALSE,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE clipboard_fts USING fts5(
  content, content='clipboard_items', content_rowid='id'
);
```

## Project Structure

```
clipboard-pro/
├── main.go
├── app.go                      # Wails App struct + lifecycle
├── internal/
│   ├── clipboard/
│   │   └── monitor.go          # goroutine, golang.design/x/clipboard
│   ├── storage/
│   │   ├── db.go               # SQLite init + migrations
│   │   ├── models.go           # GORM models
│   │   └── repository.go       # CRUD + FTS5 search
│   ├── server/
│   │   └── api.go              # localhost HTTP API + auth
│   └── config/
│       └── config.go           # port, token, retention settings
├── frontend/
│   └── src/
│       ├── App.tsx
│       └── components/
│           ├── ClipboardList.tsx
│           ├── SearchBar.tsx
│           └── ClipboardItem.tsx
├── extension/
│   ├── manifest.json           # MV3
│   ├── popup/
│   └── background/
└── wails.json
```

## MVP Scope (v1)

1. Clipboard monitoring — text + image (golang.design/x/clipboard)
2. History list — virtual scroll, 1000 items default
3. Fuzzy search — FTS5 SQLite
4. Click to re-copy
5. System tray + global hotkey (`Ctrl+Shift+V`)
6. Browser extension — text fetch from local API
7. SHA256 dedup — no duplicate entries
8. Auto-cleanup — items older than 30 days (configurable)

## Risks

| Risk | Level | Mitigation |
|------|-------|-----------|
| golang.design/x/clipboard macOS edge cases | Medium | Test early, fallback AppleScript |
| Browser blocks http localhost | Low | Chrome/Edge allow, Firefox needs config |
| Wails macOS entitlements for system tray | Medium | Document in README, test on CI |
| Image storage growth | Medium | Auto-cleanup + size cap (500MB default) |
| SQLite concurrent access (app + HTTP server) | Low | WAL journal mode |

## Success Criteria

- [ ] Clipboard items captured within 1s of copy
- [ ] Search returns results in <100ms for 1000 items
- [ ] App memory < 50MB idle
- [ ] Binary size < 20MB (Wails target)
- [ ] Browser extension connects to local API in < 500ms

## Unresolved Questions

1. Windows 11: Does golang.design/x/clipboard interact with Win11 cloud clipboard? Need to test.
2. Image format: Support .webp alongside PNG/JPG?
3. Auto-start on system boot: LaunchAgent (macOS) / Task Scheduler (Windows) setup?
4. SQLite journal mode: WAL vs DELETE for concurrent access?
5. Extension: Handle case where desktop app not running gracefully?
