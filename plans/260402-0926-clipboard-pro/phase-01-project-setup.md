# Phase 01: Project Setup & Wails Init

## Context Links

- [Plan Overview](plan.md)
- [Architecture Brainstorm](../reports/brainstorm-260402-0926-clipboard-pro-architecture.md)

## Overview

- **Priority:** P1 — blocks all other phases
- **Status:** completed
- **Effort:** 1h
- **Description:** Initialize Wails v2 project with React/TS template, add Go dependencies, create directory structure, configure git.

## Key Insights

- Wails `react-ts` template scaffolds frontend + Go main entry
- Must ensure CGO_ENABLED=1 for later gohook dependency
- SQLite FTS5 bundled with `go-sqlite3` (build tag `fts5`)

## Requirements

### Functional
- Wails project compiles and runs (`wails dev`)
- Frontend hot-reload works
- All Go dependencies resolve

### Non-functional
- Clean project structure matching architecture spec
- `.gitignore` excludes build artifacts, DB files, data dir

## Architecture

Standard Wails v2 scaffolding with custom `internal/` package structure for backend modules.

## Related Code Files

### Create
- `go.mod` (via wails init + go get)
- `wails.json`
- `.gitignore`
- `internal/clipboard/` (empty, placeholder)
- `internal/storage/` (empty, placeholder)
- `internal/server/` (empty, placeholder)
- `internal/config/` (empty, placeholder)
- `extension/` (empty, placeholder)

## Implementation Steps

1. Verify prerequisites: `go version` (1.21+), `node --version` (18+), `wails doctor`
2. Install Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
3. Init project: `wails init -n clipboard-pro -t react-ts` in working directory
   - If directory not empty, init in temp dir and move files
4. Add Go dependencies:
   ```
   go get golang.design/x/clipboard
   go get github.com/robotn/gohook
   go get github.com/getlantern/systray
   go get github.com/mattn/go-sqlite3
   go get gorm.io/gorm
   go get gorm.io/driver/sqlite
   go get github.com/gen2brain/beeep
   go get github.com/google/uuid
   ```
5. Create directory structure:
   ```
   mkdir -p internal/clipboard internal/storage internal/server internal/config
   mkdir -p extension/popup extension/background
   ```
6. Create `.gitignore`:
   ```
   build/
   frontend/dist/
   frontend/node_modules/
   *.db
   data/
   .env
   ```
7. Install frontend dependencies:
   ```
   cd frontend && npm install @tanstack/react-virtual tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```
8. Install shadcn/ui:
   ```
   npx shadcn-ui@latest init
   ```
9. Verify: `wails dev` starts without errors
10. Init git repo: `git init && git add . && git commit -m "feat: init wails project with react-ts template"`

## Todo List

- [x] Install Wails CLI
- [x] Init Wails project with react-ts template
- [x] Add all Go dependencies to go.mod
- [x] Create internal/ directory structure
- [x] Create extension/ directory structure
- [x] Configure .gitignore
- [x] Install frontend deps (tanstack, tailwind, shadcn)
- [x] Verify `wails dev` compiles and runs
- [x] Init git repo with initial commit

## Success Criteria

- `wails dev` opens browser window with default Wails template
- `go build ./...` compiles without errors
- All directories exist per project structure spec
- Git repo initialized with clean first commit

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Wails CLI not installed globally | Low | Step 2 handles install |
| CGO not available on Windows | Medium | Ensure GCC installed (TDM-GCC or MSYS2) |
| Node version mismatch | Low | Use nvm if needed |

## Security Considerations

- No secrets at this phase
- `.gitignore` configured to exclude `.env` and data files

## Next Steps

- Phase 02 (Go Backend Core) and Phase 03 (React Frontend) can start in parallel once setup complete
