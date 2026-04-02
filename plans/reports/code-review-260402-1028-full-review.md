# Code Review — Clipboard Pro Full Review
Date: 2026-04-02 | Reviewer: code-reviewer agent

---

## Summary

Reviewed all 17 files covering the Go backend, React/TS frontend, and Chrome MV3 extension. The codebase is clean, well-structured, and modular for its scope. Most issues are correctness/security bugs rather than architectural problems. Overall ship verdict is at the bottom.

---

## Critical Issues (must fix before ship)

### C1 — FTS5 query is injectable via user-supplied search string
**File:** `internal/storage/repository.go:47-54`

The `Search` method passes `query` directly as the FTS5 MATCH parameter via GORM `.Raw(... MATCH ?`, query ...)`. While this uses parameterised binding, FTS5 MATCH syntax allows a user to supply expressions like `"a" OR "b"`, special FTS5 operators (`NOT`, `AND`, column filters, `NEAR`), or a trailing `*` wildcard. None of this is validated or sanitised.

More critically, a malformed FTS5 expression (e.g., an unbalanced quote) causes SQLite to return an error which is propagated to the API response body verbatim via `err.Error()` in `api.go:126`. This leaks internal DB error text to any caller that holds a valid token.

**Also in `api.go`:** `handleSearch` passes the raw query string from `r.URL.Query().Get("q")` directly to `repo.Search` with only a whitespace trim. No length cap, no character class validation. A very long query string will be sent to SQLite wholesale.

**Fix required:**
- Sanitise/escape special FTS5 characters before use, or wrap the term with double-quotes and escape internal quotes: `"` → `""`.
- Cap the query length (e.g., 512 bytes).
- Do not echo raw `err.Error()` from storage into HTTP 500 responses; return a generic message and log internally.

---

### C2 — Auth token loaded from chrome.storage on every message (no caching = race + stale read risk)
**File:** `extension/background/service-worker.ts:97`

`api.loadToken()` is called inside every message handler invocation. In a service worker, `chrome.storage.local.get` is async and takes a non-trivial round trip. If two messages arrive in rapid succession the second can begin before the first `loadToken` resolves, both read the same (possibly stale) token. More importantly this is unnecessary overhead.

The token should be loaded once at service worker start and refreshed only on `chrome.storage.onChanged`. The current code works but is fragile if the user changes the token mid-session.

**Fix required:** Load token at startup; subscribe to `chrome.storage.onChanged` to update `this.token`.

---

### C3 — `handleHistory` in `api.go` fetches ALL items then filters in Go
**File:** `internal/server/api.go:95-113`

`repo.GetAll(limit, offset)` is called with the caller-provided `limit`/`offset`, but the result is then filtered to `type = 'text'` in Go-land. This means:
- The `limit` no longer represents the true number of text items returned (could be fewer).
- A caller requesting `limit=20` might get 0 items if all 20 fetched rows are images.
- Pagination is broken: `offset` skips mixed-type rows at the DB level but the consumer only sees text rows.

**Fix required:** Push the `type = 'text'` filter into the SQL query in `Repository.GetAll` (or add a new `GetAllText` method), rather than filtering post-fetch in Go.

---

### C4 — `maxItems` config field is never enforced
**File:** `internal/config/config.go:17`, `app.go` throughout

`Config.MaxItems` is stored, exposed via `GetConfig`/`SaveConfig`, and shown in the settings UI, but there is no code anywhere that checks it before saving a new item or that prunes when the count is exceeded. A user who sets `MaxItems = 100` will see no enforcement.

**Fix required:** In `monitor.go` after a successful `repo.Save`, call `repo.Count()` and if it exceeds `MaxItems`, delete the oldest unpinned item(s), or enforce the cap in `Repository.Save`.

---

## Warnings (should fix)

### W1 — `lastHash` shared between text and image checks without mutex
**File:** `internal/clipboard/monitor.go:28-29, 82-98, 112-136`

`m.lastHash` is a plain `string` field on `Monitor`. `checkText` and `checkImage` are both called sequentially within the same goroutine (`poll`), so there is no data race today. However, the design couples text and image dedup into one field. If an image is copied right after a text item (same byte sequence is impossible but hash collision is non-zero over many items), the image check at line 113 `if hash == m.lastHash` will incorrectly skip it because `lastHash` was just set by the text check.

More practically: if a user copies a text string, then copies an image whose SHA-256 happens to collide with the text's SHA-256 (near-impossible but theoretically non-zero), the image will be skipped. The correct fix is to maintain separate `lastTextHash` and `lastImageHash` fields.

**Fix:** Split into `lastTextHash string` and `lastImageHash string`.

---

### W2 — `startup` silently continues on config load error by retrying blindly
**File:** `app.go:41-45`

```go
cfg, err := config.Load()
if err != nil {
    fmt.Println("[app] config load error:", err)
    cfg, _ = config.Load() // retry once with fresh defaults
}
```

If the first `config.Load()` fails (e.g., disk full, permission denied), the second call will fail for exactly the same reason. `cfg` will be `nil` and `a.config = cfg` is a nil pointer. Any subsequent call to `a.GetConfig()` or `a.SaveConfig()` will panic.

**Fix:** On error from the second load, assign explicit defaults directly (`cfg = config.defaults()` is unexported — either export it or inline safe defaults) and log a clear warning. Better: return/panic early rather than continuing with a nil config.

---

### W3 — Image file path stored as absolute path in DB; breaks on data directory move
**File:** `internal/clipboard/monitor.go:151, 155`

`saveImageFile` returns an absolute filesystem path like `/home/user/.clipboard-pro/data/items/<uuid>.png`. This absolute path is stored in `ClipboardItem.FilePath`. The model comment says "relative path" but the code stores absolute paths. If the user changes `DataDir` in settings (now permitted via `SaveConfig`), all existing image records point to stale paths.

**Fix:** Store relative paths (relative to `dataDir`). On read, join with current `dataDir`. Update `repository.go Delete` and `DeleteOlderThan` to reconstruct the absolute path before `os.Remove`.

---

### W4 — `TogglePin` uses a raw SQL expression that is SQLite-only
**File:** `internal/storage/repository.go:71-74`

`gorm.Expr("NOT is_pinned")` works in SQLite but is not portable and bypasses GORM's normal boolean handling. This is low risk for a SQLite-only app, but GORM may not properly emit a changed event / the row version will be stale on the in-memory representation. The caller in `App.TogglePin` discards the updated value and the frontend does an optimistic flip (`!item.isPinned`) — if the DB flip silently fails the UI will be out of sync with no error surfaced.

**Fix:** After `TogglePin` DB update, either return the new state, or have the frontend refetch the item. At minimum, check `.RowsAffected` on the result.

---

### W5 — CORS middleware reflects any `chrome-extension://` or `moz-extension://` origin unconditionally
**File:** `internal/server/api.go:61-75`

The CORS middleware sets `Access-Control-Allow-Origin` to the exact value of the incoming `Origin` header as long as it starts with `chrome-extension://` or `moz-extension://`. Any installed extension (not just Clipboard Pro's own) can make credentialed requests if it sends that origin. Combined with the auth token check this is a second layer of defence, but the CORS policy itself is weaker than it could be.

Since the extension ID is fixed at build time it should be possible to hardcode it (or load it from config). At a minimum, document the decision.

---

### W6 — `handlePaste` in `api.go` does not verify HTTP method via router; relies on manual check
**File:** `internal/server/api.go:135-137`

The mux registers `/api/v1/paste` via `mux.HandleFunc` which accepts all methods. The handler then manually checks `r.Method != http.MethodPost`. This works, but other endpoints (`/history`, `/search`) have no method guard at all — a POST to `/history` will succeed. Not a security issue because they are read-only, but it is inconsistent.

**Fix:** Either use a method-aware router or add explicit method checks to all handlers.

---

### W7 — `saveImageFile` fallback writes raw bytes as PNG without validation
**File:** `internal/clipboard/monitor.go:149-153`

If `png.Decode` fails, the code writes the raw bytes to disk with a `.png` extension anyway. These bytes are then stored in the DB and later served to the frontend as `wails://localhost/<path>`. Depending on what `golang.design/x/clipboard` returns for non-PNG image data, this could write non-image data (BMP, DIB, raw RGBA) as a `.png` file. The frontend's `onError` handler hides the broken image, but the orphaned file remains on disk.

**Fix:** On `png.Decode` failure, log and return an error rather than writing unvalidated raw bytes.

---

### W8 — `runCleanup` goroutine has no cancellation path
**File:** `app.go:127-134`

The cleanup goroutine created in `startup` runs `for range ticker.C` and has no `select` on a done channel. When `shutdown` is called, `monitor.Stop()` and `server.Stop()` are cancelled, but the cleanup goroutine continues to run until the process exits. On a graceful shutdown, `a.repo.DeleteOlderThan` may still be executing while the DB is being closed — this can cause a `sql: database is closed` error.

**Fix:** Pass a `context.Context` (or done channel) to `runCleanup` and select on it in the loop body.

---

## Minor Notes

### N1 — `GetByHash` method in `repository.go` is never called
**File:** `internal/storage/repository.go:113-118`

`GetByHash` is defined but unused. `Save` duplicates the hash-check logic inline. Either use `GetByHash` in `Save` or remove it (YAGNI).

---

### N2 — `config.Load` ignores error from `os.UserHomeDir`
**File:** `internal/config/config.go:22, 31`

`home, _ := os.UserHomeDir()` swallows any error. On certain hardened environments `UserHomeDir` can return an empty string with an error. This would result in config being written to `/.clipboard-pro/config.json` (root on Unix or a relative path on Windows) without warning.

**Fix:** Check the error and return it from `configDir()`.

---

### N3 — `ClipboardItem` interface duplicated across extension files
**File:** `extension/background/service-worker.ts:3-12`, `extension/popup/popup.ts:3-11`

The `ClipboardItem` interface is defined identically in both files. Should be extracted to a shared `extension/types.ts` file. Minor DRY violation.

---

### N4 — `relativeTime` duplicated in `ClipboardItem.tsx` and `popup.ts`
**File:** `frontend/src/components/ClipboardItem.tsx:15-21`, `extension/popup/popup.ts:26-32`

Same utility function duplicated. These live in different build contexts (Wails frontend vs extension), so some duplication is unavoidable, but worth noting.

---

### N5 — `handlePing` returns a hardcoded version string
**File:** `internal/server/api.go:92`

`"version": "1.0.0"` is hardcoded. Should be a build-time constant or read from a shared `version.go` file so it stays in sync with the binary.

---

### N6 — Auth token displayed and copyable in settings UI sent over navigator.clipboard
**File:** `frontend/src/components/SettingsPanel.tsx:31-35`

`navigator.clipboard.writeText(config.authToken)` requires clipboard permission in the browser context. Inside a Wails webview this should work, but if permissions are denied the `catch(() => {})` silently swallows the failure and the user sees "Copied!" toast without the token actually being on the clipboard. The `setTokenCopied(true)` should only be called if the write succeeded.

---

### N7 — No input validation for `retentionDays` and `maxItems` on the Go side
**File:** `app.go:187-190`

`SaveConfig` accepts any `Config` struct from the frontend without validation. A frontend bug or malicious JS injection could set `RetentionDays = 0`, which would cause `DeleteOlderThan(0)` to delete all non-pinned items on the next cleanup tick.

**Fix:** Validate bounds in `SaveConfig` (e.g., `RetentionDays >= 1`, `MaxItems >= 10`).

---

### N8 — `loadHistory` in `App.tsx` captures `offset` in useCallback dependency but resets it conditionally
**File:** `frontend/src/App.tsx:32-45`

`loadHistory` depends on `offset` via the dependency array, which means a new function reference is created on every offset change. The initial `useEffect` calls `loadHistory(true)` once (with the `eslint-disable` comment suppressing the missing dep warning). This works, but the design is fragile. If `offset` changes between the initial render and the effect execution, the first load will use the stale offset. A `useRef` for offset tracking (like `queryRef` already does for query) would be cleaner.

---

## Positive Observations

- HTTP server correctly binds to `127.0.0.1` only — local-only exposure is correctly implemented.
- SQLite WAL mode and `_busy_timeout=5000` are appropriate for a single-writer desktop app.
- Image file cleanup on delete is handled in both `Delete` and `DeleteOlderThan` with orphan rollback on save failure.
- Context cancellation in `monitor.poll` via `m.ctx.Done()` is correctly wired.
- `wails-bridge.ts` pattern (stub/real split) is clean and keeps components testable.
- FTS5 content table design (using `content=` and `content_rowid=`) is correct and includes all three trigger types (insert/update/delete).
- Config file permissions (0600) and directory permissions (0700) are correctly set.
- `maxImageSize` guard prevents outsized clipboard images filling disk.
- Debounce on search input (both frontend and extension) is implemented correctly with cleanup on unmount.
- Virtual list (`@tanstack/react-virtual`) for clipboard history is a good call for performance.

---

## Overall Assessment

**NOT READY TO SHIP** — 4 critical issues must be resolved first.

| Priority | Count |
|----------|-------|
| Critical | 4 (C1–C4) |
| Warning  | 8 (W1–W8) |
| Minor    | 8 (N1–N8) |

The two highest-priority fixes are **C1** (FTS5 injection + error leakage) and **C3** (broken pagination due to Go-side filtering). **C4** (maxItems not enforced) is a feature-correctness bug that will cause user confusion. **C2** (token loading per message) is a correctness/race issue in the extension.

Once C1–C4 are addressed and W1, W2, W7, W8 are patched, the codebase is in good shape to ship.

---

## Unresolved Questions

1. Does `golang.design/x/clipboard` on Windows return PNG-encoded data or raw DIB/RGBA for image clipboard reads? The fallback raw-write path in `saveImageFile` (W7) behaviour is platform-dependent and was not fully verifiable from source alone.
2. Is the Chrome extension ID stable across developer and production installs? If not, hardcoding the extension origin in CORS (W5 recommendation) requires a configuration mechanism.
3. `SaveConfig` replaces the live config but does not restart the HTTP server or clipboard monitor with new settings (e.g., changed port). Is a restart required, or is hot-reload planned?
