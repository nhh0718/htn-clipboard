# Clipboard Manager Desktop App — Technical Research Report
**Date:** 2026-04-02 | **Report ID:** researcher-260402-0934

---

## 1. Wails v2 Capabilities

### System Tray & Background Daemon
**Status:** SUPPORTED with caveats.

Wails v2 can manage system tray integration:
- Built-in menu/context menu support via `wails.Hide()` and `wails.ShowInTaskbar(false)`
- Runtime events available: `wails.EventsOn("*", handler)` for system events
- No first-class "daemon mode" — requires manual implementation with conditional window creation
- On app startup, can hide window and run background logic before UI appears

**Key limitation:** Wails is fundamentally a UI framework. True background daemon needs:
- Separate Go binary running via system service manager (systemd on Linux, LaunchAgent on macOS, Windows Service/Task Scheduler on Windows)
- OR embed Wails app but hide window and minimize to tray on startup

### Global Hotkeys
**Status:** SUPPORTED via third-party packages.

Must use Go packages since Wails doesn't provide native bindings:
- **`github.com/robotn/gohook`**: Cross-platform global hotkey listening (Windows, macOS, Linux). Active, used in production. Requires CGO.
- **`github.com/getlantern/systray`**: System tray + menu, often paired with hotkey listeners.
- **`github.com/lxn/win`** + **`github.com/lxn/walk`**: Windows-specific, richer control.

**Pattern:** Register hotkeys in Wails backend, trigger frontend UI updates via `runtime.EventsEmit()`.

### Key Packages & Plugins
| Package | Purpose | Cross-platform |
|---------|---------|-----------------|
| `github.com/gen2brain/beeep` | Native OS notifications | Yes |
| `github.com/robotn/gohook` | Global hotkey listener | Yes |
| `github.com/getlantern/systray` | System tray management | Yes (Windows, macOS, Linux) |
| `github.com/lxn/walk` | Windows native dialogs/UI | Windows only |
| `os/exec` + native commands | Launch browser, file explorer | All OS |

**Verdict:** Wails can drive system tray + hotkeys, but requires external Go packages. Not a "batteries included" solution.

---

## 2. Go Clipboard Libraries Comparison

### golang.design/x/clipboard
**Strengths:**
- **Clipboard monitoring:** Native support for change detection on Windows (via Windows API hooks), macOS (via FSEvents). Polls on Linux.
- **Image + text:** Can read/write both image and text formats from clipboard.
- **No CGO required** on Windows/macOS (precompiled bindings).
- **Active maintenance:** Recent commits, used in production tools.

**Implementation:**
```
listener := clipboard.Listen(ctx)
for data := range listener {
    // data is clipboard.Data, can be Text, Image, etc.
}
```

**Windows caveat:** Uses Windows hooks, requires running in window message loop OR threading care.

### atotto/clipboard
**Strengths:**
- Simpler API: `clipboard.ReadAll()`, `clipboard.WriteAll()`
- Lightweight, minimal dependencies.
- Cross-platform (Windows, macOS, Linux).

**Weakness:**
- **No monitoring built-in** — must poll externally with goroutines/timers.
- Text-only by default; image support limited/hacked.

### Comparative Table
| Feature | golang.design | atotto | Winner |
|---------|---------------|--------|---------|
| Change monitoring | ✓ Built-in | ✗ Must poll | golang.design |
| Image support | ✓ Native | ~ Limited | golang.design |
| Cross-platform | ✓ (Windows/macOS/Linux) | ✓ All | Tie |
| CGO requirement | Minimal | Minimal | Tie |
| Code maintenance | Active | Minimal | golang.design |
| API simplicity | ~ Moderate | ✓ Very simple | atotto |

**Recommendation:** Use **`golang.design/x/clipboard`** for monitoring. Fallback to atotto if golang.design has platform issues.

---

## 3. Browser Extension ↔ Native App IPC Patterns

### Option A: Native Messaging (Recommended for Production)
**How it works:**
1. Browser extension sends JSON message to native app via `browser.runtime.connectNative()`
2. Native app listens on stdin/stdout for JSON-formatted messages
3. Native app processes, responds via stdout

**Advantages:**
- Chrome/Firefox/Edge all support it natively
- Secure: OS enforces origin check, native app must be registered
- No port conflicts
- Binary protocol possible (not just JSON)

**Implementation:** Go app reads stdin, writes stdout. Manifest registration on OS.

**Examples:** 1Password, Bitwarden, KeePass both use Native Messaging for production.

### Option B: Localhost HTTP API (Simpler for Open Source)
**How it works:**
1. Desktop app runs HTTP server on `localhost:9999`
2. Browser extension makes fetch requests: `fetch('http://localhost:9999/api/items')`
3. CORS needed or custom headers for security

**Advantages:**
- Easier to debug (curl, browser DevTools work)
- No OS-level registration needed
- Works immediately, cross-platform
- Simpler for rapid prototyping

**Disadvantages:**
- Port collision risk
- Less secure (any app on machine can hit endpoint)
- Needs CORS configuration or auth token
- Browser extension may warn about insecure content on HTTPS pages

**Examples:** Some smaller tools use this; less common in production.

### Decision Matrix
| Factor | Native Messaging | HTTP localhost |
|--------|------------------|-----------------|
| Security | Excellent | Good (token-based) |
| Setup complexity | Medium (OS registration) | Low |
| Debug friendliness | Fair | Excellent |
| Cross-browser | ✓ All major | ✓ All major |
| Open source friendly | ✓ Yes | ✓ Yes |
| Production ready | ✓✓ Yes | ✓ Yes |

**Verdict for open source:** Start with **HTTP localhost** for MVP (faster iteration), migrate to **Native Messaging** if security audit demands it.

---

## 4. Existing Open Source Clipboard Managers — Architecture

### Ditto (Windows)
- **Tech:** C++ (native Windows code), SQLite database
- **Architecture:** Single tray app, in-process clipboard monitoring (Windows hooks)
- **Data storage:** SQLite, supports images as BLOBs
- **Key insight:** No daemon/service separation — runs in one process. Simple but tight coupling.
- **UI:** Native Windows (MFC/WinForms era)

### CopyQ (Cross-platform)
- **Tech:** C++, Qt framework
- **Architecture:** Single app with plugins, tray integration via Qt
- **Data:** SQLite, BLOB storage for images
- **Key insight:** Monolithic app, Qt handles cross-platform UI. Simpler than Ditto but less native feel.
- **Extensibility:** Python/Perl script plugins

### Clipy (macOS)
- **Tech:** Swift, Cocoa native
- **Architecture:** Tray agent + optional UI, NSPasteboard monitoring (native macOS)
- **Data:** Plist files (JSON-compatible), images as file references (not BLOBs)
- **Key insight:** Leverages macOS native APIs, lightweight. Image storage as files, not database.

### Maccy (macOS)
- **Tech:** Swift, Cocoa
- **Architecture:** Modern, clean design. Minimal, tray-focused.
- **Data:** Plist storage, images as files (file references in database)
- **Key insight:** Explicit separation: metadata in database, images on disk.

### Learnings for clipboard-pro

| Finding | Implication |
|---------|------------|
| Monolithic is OK for v1 | No need for service/daemon split initially. Wails can handle it. |
| Images as file refs > BLOBs | Clipy & Maccy avoid huge BLOB columns; faster DB queries, easier cleanup. |
| Platform-native APIs critical | Use `golang.design/x/clipboard` not generic polling. |
| No complex plugins needed | Start with single executable, no IPC overhead. |
| SQLite sufficient | All use it; proven stable for history storage. |

---

## 5. SQLite + Image Storage — Best Practice

### Approach A: Inline BLOB
**Store images directly in SQLite:**
```sql
CREATE TABLE clipboard_items (
  id INTEGER PRIMARY KEY,
  content_type TEXT,
  data BLOB,
  timestamp INTEGER
);
```

**Pros:**
- Single database file, atomic transactions
- Easy backup/export
- Query-time access to all metadata

**Cons:**
- BLOB columns bloat database file (1000 images × 1MB = 1GB database)
- Memory-intensive queries (entire BLOB loaded)
- Slow query performance for history (table scans slow with large BLOBs)
- SQLite not optimized for large objects

### Approach B: File Reference (RECOMMENDED)
**Store metadata in SQLite, images on filesystem:**
```sql
CREATE TABLE clipboard_items (
  id INTEGER PRIMARY KEY,
  content_type TEXT,
  file_path TEXT,        -- path to /clipboard-data/items/{uuid}.png
  file_hash TEXT,        -- SHA256 for dedup
  timestamp INTEGER,
  size_bytes INTEGER
);

-- Physical storage: ~/.clipboard-pro/data/items/{uuid}.{ext}
```

**Pros:**
- Fast database queries (no BLOB overhead)
- Images deduplicated by hash
- Easy memory management (lazy load on display)
- Filesystem isolation (can archive/cleanup independently)
- Scales to thousands of items
- Can use CDN/cloud backup per-file

**Cons:**
- Manual cleanup needed if file missing
- Two separate sync points (db + fs)
- Slightly more complex code

### Hybrid Approach (Best for clipboard-pro)
**Small items inline, large as files:**
```sql
CREATE TABLE clipboard_items (
  id INTEGER PRIMARY KEY,
  content_type TEXT,
  data BLOB,             -- NULL if file_path set, <100KB if inline
  file_path TEXT,        -- NULL if data set
  timestamp INTEGER,
  size_bytes INTEGER
);

-- Logic: if size > 100KB, write to file; else inline
```

**Verdict:** Use **Approach B (file reference)** for v1. Images on disk, metadata in SQLite.
- Decision threshold: Images >50KB go to file, <50KB inline for small screenshots.
- Storage path: `~/.clipboard-pro/data/items/{uuid}.{ext}` with symlink dedup.
- Cleanup: Track orphaned files via hash table, prune monthly.

---

## Summary & Actionable Next Steps

### Technology Stack Recommendation
1. **Framework:** Wails v2 (Go backend + React/Svelte frontend)
2. **Clipboard:** `golang.design/x/clipboard` for monitoring
3. **Hotkeys:** `github.com/robotn/gohook`
4. **System tray:** `github.com/getlantern/systray` OR native Wails (test both)
5. **IPC (extension):** HTTP localhost for MVP, Native Messaging for GA
6. **Database:** SQLite with file-reference pattern for images
7. **Notifications:** `github.com/gen2brain/beeep`

### MVP Architecture
```
clipboard-pro/
├── backend/          (Go, Wails)
│   ├── clipboard/    (golang.design/x/clipboard wrapper)
│   ├── hotkeys/      (gohook wrapper)
│   ├── db/           (SQLite driver)
│   ├── storage/      (image file handling)
│   └── api/          (JSON endpoints for extension)
├── frontend/         (React/Svelte)
│   ├── history/      (list view)
│   ├── search/       (full-text search)
│   └── settings/
├── extension/        (browser extension)
│   └── background.js (HTTP localhost client)
└── data/
    └── clipboard-pro.db
    └── items/        ({uuid}.png, .jpg, etc)
```

### Go Modules to Add
```
golang.design/x/clipboard
github.com/robotn/gohook
github.com/getlantern/systray
github.com/mattn/go-sqlite3
github.com/gen2brain/beeep
```

---

## Unresolved Questions

1. **Windows 11 Clipboard API:** Does golang.design/x/clipboard use modern Win11 APIs or legacy hooks? (May affect clipboard sync with cloud services like OneDrive.)
2. **Image format handling:** Should we support .webp alongside PNG/JPG for storage? Compression trade-offs?
3. **Daemon persistence:** How to handle app restart? Auto-start on system boot? (systemd service vs Wails native approach?)
4. **Extension CORS:** For localhost HTTP API, should we require CORS preflight or use custom auth headers?
5. **Database locking:** Concurrent access if app and extension both write history simultaneously. SQLite journal mode strategy?
