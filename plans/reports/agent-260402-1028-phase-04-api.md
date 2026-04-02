# Phase 04 Implementation Report — Local HTTP API Server

## Phase
- Phase: phase-04-local-http-api-server
- Status: completed

## Files Modified

| File | Action | Lines |
|------|--------|-------|
| `internal/server/api.go` | CREATED | 170 |
| `app.go` | MODIFIED | +7 lines net |

## Tasks Completed

- [x] Created `internal/server/api.go` with `Server` struct, `NewServer`, `Start`, `Stop`
- [x] Routes: `GET /api/v1/ping`, `GET /api/v1/history`, `GET /api/v1/search`, `POST /api/v1/paste`
- [x] CORS middleware: allows `chrome-extension://` and `moz-extension://` origins; handles OPTIONS preflight
- [x] Auth middleware: validates `Authorization: Bearer {token}` against `config.AuthToken`; skipped for ping
- [x] Bound to `127.0.0.1:{config.Port}` (never 0.0.0.0)
- [x] Used standard `net/http` only (no framework)
- [x] File under 200 lines (170 lines)
- [x] Added `server *server.Server` field to `App` struct in `app.go`
- [x] Wired `server.NewServer` + `server.Start()` in `startup()` after repo init
- [x] Wired `server.Stop(ctx)` in `shutdown()` with nil guard

## Build Status

```
CGO_ENABLED=1 go build -tags fts5 ./...
```
Exit: 0 — clean, no errors or warnings.

## Notes

- History endpoint filters text-only items client-side after `GetAll`; no additional repo method needed.
- `handleSearch` guards nil slice → returns empty array `[]` not `null` in JSON.
- `handlePaste` enforces `POST` method explicitly before decode.

## Issues Encountered

None.
