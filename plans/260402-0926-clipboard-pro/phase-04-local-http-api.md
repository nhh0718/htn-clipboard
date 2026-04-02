# Phase 04: Local HTTP API Server

## Context Links

- [Plan Overview](plan.md)
- [Technical Research — IPC Patterns](../reports/researcher-260402-0934-clipboard-manager-research.md)

## Overview

- **Priority:** P2 — enables browser extension
- **Status:** completed
- **Effort:** 1.5h
- **Blocked by:** Phase 02 (needs storage.Repository)
- **Description:** Thin REST API on localhost for browser extension communication. Bearer token auth, CORS for extension origins.

## Key Insights

- HTTP localhost chosen over Native Messaging for MVP simplicity
- Port 27843 (uncommon, low collision risk)
- Must allow CORS from `chrome-extension://*` and `moz-extension://*`
- Auth via `Authorization: Bearer {token}` — token from config.json
- Reuses same `storage.Repository` as Wails app — SQLite WAL handles concurrent reads

## Requirements

### Functional
- `GET /api/v1/history` — paginated text item list
- `GET /api/v1/search?q=...` — FTS5 search
- `POST /api/v1/paste` — copy item to clipboard by ID
- `GET /api/v1/ping` — health check (no auth)
- Bearer token auth on all routes except ping

### Non-functional
- Response time <50ms for history/search
- Graceful shutdown when app exits
- No external network access (bind to 127.0.0.1 only)

## Architecture

```
internal/server/api.go
├── AuthMiddleware (Bearer token validation)
├── CORSMiddleware (chrome-extension, moz-extension)
├── GET  /api/v1/ping       → {"status":"ok"}
├── GET  /api/v1/history    → []ClipboardItem (text only)
├── GET  /api/v1/search     → []ClipboardItem (FTS5)
└── POST /api/v1/paste      → copy to clipboard
```

## Related Code Files

### Create
- `internal/server/api.go`

### Modify
- `app.go` — start HTTP server in startup()

## Implementation Steps

### Step 1: Server Struct

1. Define `Server` struct:
   ```go
   type Server struct {
       repo   *storage.Repository
       config *config.Config
       server *http.Server
   }
   ```
2. Constructor: `NewServer(repo, config) *Server`

### Step 2: Middleware

1. **Auth middleware:**
   - Extract `Authorization` header
   - Validate `Bearer {token}` matches `config.AuthToken`
   - Return 401 if invalid
   - Skip auth for `/api/v1/ping`
2. **CORS middleware:**
   - Allow origins: `chrome-extension://*`, `moz-extension://*`
   - Allow headers: `Authorization, Content-Type`
   - Allow methods: `GET, POST, OPTIONS`
   - Handle OPTIONS preflight

### Step 3: Route Handlers

1. **`GET /api/v1/ping`**
   - Response: `{"status": "ok", "version": "1.0.0"}`
   - No auth required

2. **`GET /api/v1/history?limit=20&offset=0`**
   - Parse query params, default limit=20, max=100, offset=0
   - Call `repo.GetAll(limit, offset)` — filter to text items only for extension
   - Response: `{"items": [...], "total": N}`

3. **`GET /api/v1/search?q=keyword&limit=20`**
   - Parse query params
   - Call `repo.Search(q, limit)`
   - Response: `{"items": [...], "total": N}`

4. **`POST /api/v1/paste`**
   - Body: `{"id": 123}`
   - Look up item by ID, write content to clipboard
   - Response: `{"success": true}`
   - Return 404 if item not found

### Step 4: Server Lifecycle

1. `Start()` — launch HTTP server in goroutine:
   ```go
   s.server = &http.Server{
       Addr:    fmt.Sprintf("127.0.0.1:%d", s.config.Port),
       Handler: s.router(),
   }
   go s.server.ListenAndServe()
   ```
2. `Stop(ctx)` — graceful shutdown:
   ```go
   s.server.Shutdown(ctx)
   ```
3. Use `net/http` standard library (no framework needed — only 4 routes)

### Step 5: Integration with app.go

1. In `app.startup()`: `server.Start()`
2. In `app.shutdown()`: `server.Stop(ctx)`

## Todo List

- [x] Define Server struct with repo + config
- [x] Implement auth middleware (Bearer token)
- [x] Implement CORS middleware (extension origins)
- [x] Implement GET /api/v1/ping
- [x] Implement GET /api/v1/history (paginated)
- [x] Implement GET /api/v1/search (FTS5)
- [x] Implement POST /api/v1/paste (copy to clipboard)
- [x] Server Start/Stop lifecycle
- [x] Wire into app.go startup/shutdown
- [x] Test with curl: all endpoints

## Success Criteria

- `curl localhost:27843/api/v1/ping` returns 200
- `curl -H "Authorization: Bearer {token}" localhost:27843/api/v1/history` returns items
- Unauthorized requests return 401
- CORS headers present for extension origins
- Server binds to 127.0.0.1 only (not 0.0.0.0)
- Graceful shutdown on app exit

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Port 27843 already in use | Low | Config allows changing port; log error on startup |
| CORS blocked by browser | Low | Test with actual extension; Chrome allows localhost |
| Concurrent DB access | Low | SQLite WAL mode handles this |

## Security Considerations

- **Bind 127.0.0.1 only** — never expose to network
- Bearer token auth on all data routes
- Token is UUID v4 — 128 bits of entropy
- No write operations exposed except paste (re-copy)
- Rate limiting not needed for localhost MVP

## Next Steps

- Phase 05 (Browser Extension) depends on this API being functional
- Test API manually with curl before extension development
