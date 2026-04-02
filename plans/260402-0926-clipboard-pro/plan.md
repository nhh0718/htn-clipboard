---
title: "Clipboard Pro — Cross-Platform Clipboard Manager"
description: "Wails desktop app + Chrome extension for clipboard history management"
status: completed
priority: P1
effort: 12h
issue: ~
branch: main
tags: [desktop, go, react, extension, feature]
created: 2026-04-02
---

# Clipboard Pro — Implementation Plan

## Summary

Cross-platform clipboard history manager: Wails v2 desktop app (Go + React/TS) with Chrome MV3 extension. Local-only SQLite storage, FTS5 search, image support, system tray, global hotkey.

## Architecture

```
Wails App (Go backend + React frontend)
├── Clipboard Monitor (goroutine) → SQLite + filesystem
├── Wails Bindings → React UI (virtual scroll, search)
├── HTTP API (localhost:27843) → Browser Extension (MV3)
└── System Tray + Global Hotkey (robotn/gohook)
```

## Phase Overview

| Phase | Name | Group | Blocked By | Effort | Status |
|-------|------|-------|-----------|--------|--------|
| [01](phase-01-project-setup.md) | Project Setup & Wails Init | A | — | 1h | completed |
| [02](phase-02-go-backend-core.md) | Go Backend Core | B | Phase 01 | 3h | completed |
| [03](phase-03-react-frontend.md) | React Frontend UI | B | Phase 01 | 3h | completed |
| [04](phase-04-local-http-api.md) | Local HTTP API Server | C | Phase 02 | 1.5h | completed |
| [05](phase-05-browser-extension.md) | Browser Extension | D | Phase 04 | 2h | completed |
| [06](phase-06-build-and-ci.md) | Build, CI & GitHub Release | E | 02+03+05 | 1.5h | completed |

## Dependency Graph

```
Phase 01 (Setup)
    ├──▶ Phase 02 (Backend) ──▶ Phase 04 (API) ──▶ Phase 05 (Extension) ──┐
    └──▶ Phase 03 (Frontend)                                               ├──▶ Phase 06 (CI)
         └─────────────────────────────────────────────────────────────────┘
```

**Parallel groups:** Phase 02 + 03 run concurrently (Group B).

## Key Dependencies

- Wails v2 CLI + Go 1.21+
- Node.js 18+ for frontend
- CGO_ENABLED=1 for robotn/gohook
- SQLite with FTS5 extension (bundled with go-sqlite3)

## Research Reports

- [Architecture Brainstorm](../reports/brainstorm-260402-0926-clipboard-pro-architecture.md)
- [Technical Research](../reports/researcher-260402-0934-clipboard-manager-research.md)

## Success Criteria

- Clipboard captured within 1s of copy
- FTS5 search <100ms for 1000 items
- App memory <50MB idle
- Binary <20MB
- Extension connects to API <500ms
