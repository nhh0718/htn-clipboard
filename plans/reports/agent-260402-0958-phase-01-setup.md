# Phase 01 Report: Project Setup & Wails Init

**Date:** 2026-04-02
**Status:** Completed (with noted caveats)

---

## Steps Completed / Skipped

1. **Tool verification** - Go 1.25.1, Node 22.19.0, npm 10.9.3 confirmed. Wails not installed — installed via `go install github.com/wailsapp/wails/v2/cmd/wails@latest` → v2.12.0.

2. **Wails init** - `wails.json` did not exist. Directory already existed with `.claude/` and `plans/` subdirs, so `wails init` failed with "dir exists". Workaround: initialized into temp dir (`clipboard-pro-temp`) then copied all files into `clipboard-pro/`. Build + template files landed correctly.

3. **Go dependencies** - All added successfully:
   - `golang.design/x/clipboard v0.7.1`
   - `github.com/robotn/gohook v0.42.3`
   - `github.com/getlantern/systray v1.2.2`
   - `github.com/mattn/go-sqlite3 v1.14.38`
   - `gorm.io/gorm v1.31.1`
   - `gorm.io/driver/sqlite v1.6.0`
   - `github.com/gen2brain/beeep v0.11.2`
   - `github.com/google/uuid v1.6.0`

4. **Directory structure** - Created:
   - `internal/clipboard/`, `internal/storage/`, `internal/server/`, `internal/config/`
   - `extension/popup/`, `extension/background/`

5. **`.gitignore`** - Updated with `build/`, `frontend/dist/`, `frontend/node_modules/`, `*.db`, `data/`, `.env`.

6. **Frontend deps** - Installed:
   - `@tanstack/react-virtual ^3.13.23`
   - `tailwindcss ^3.4.19` (downgraded from auto-installed v4 — see shadcn note)
   - `postcss ^8.5.8`, `autoprefixer ^10.4.27`
   - Tailwind config: created `tailwind.config.ts` (full shadcn color tokens) and `postcss.config.js`

7. **shadcn/ui** - `npx shadcn@latest init --defaults` failed repeatedly. Root cause: shadcn v4 CLI cannot detect tailwind config when `"type": "module"` is set in package.json (ESM project). Mitigation: manual setup performed:
   - `components.json` created with correct schema
   - `src/lib/utils.ts` with `cn()` helper (`clsx` + `tailwind-merge`)
   - `src/index.css` with full shadcn CSS variable theme (light + dark)
   - `tailwind.config.ts` extended with all shadcn color tokens and border-radius vars
   - Additional deps installed: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@types/node`
   - `tsconfig.json` updated with `baseUrl` + `paths` (`@/*` → `./src/*`)
   - `vite.config.ts` updated with `resolve.alias` for `@/`

8. **Go build** - `CGO_ENABLED=1 go build -tags fts5 ./...` initially failed (no GCC). Installed MSYS2 via winget, then GCC 15.2.0 via pacman. Build passes cleanly with `PATH=/c/msys64/mingw64/bin:$PATH CGO_ENABLED=1 go build -tags fts5 ./...`.

9. **Git init** - `git init` + staged all source files + committed as `feat: init wails project with react-ts template` (commit `6031804`).

---

## Files / Dirs Created

- `/e/Code-Fun/clipboard-pro/wails.json`
- `/e/Code-Fun/clipboard-pro/main.go`, `app.go`, `go.mod`, `go.sum`
- `/e/Code-Fun/clipboard-pro/internal/{clipboard,storage,server,config}/`
- `/e/Code-Fun/clipboard-pro/extension/{popup,background}/`
- `/e/Code-Fun/clipboard-pro/frontend/tailwind.config.ts` (shadcn tokens)
- `/e/Code-Fun/clipboard-pro/frontend/tailwind.config.js` (simple copy, kept for compat)
- `/e/Code-Fun/clipboard-pro/frontend/postcss.config.js`
- `/e/Code-Fun/clipboard-pro/frontend/components.json`
- `/e/Code-Fun/clipboard-pro/frontend/src/index.css` (replaces style.css as entry)
- `/e/Code-Fun/clipboard-pro/frontend/src/lib/utils.ts`
- `/e/Code-Fun/clipboard-pro/frontend/src/components/ui/` (empty, ready for shadcn components)
- `/e/Code-Fun/clipboard-pro/.gitignore` (updated)

---

## Errors & Resolutions

| Error | Resolution |
|---|---|
| `wails init` fails — dir exists | Init to temp dir, copy files over |
| `npx tailwindcss init -p` fails | `"type":"module"` + tailwindcss v4 CLI issue; created configs manually |
| `shadcn init --defaults` fails — tailwind not detected | Manual shadcn setup (components.json, utils.ts, index.css, config tokens) |
| `CGO_ENABLED=1 go build` fails — no GCC | Installed MSYS2 + mingw64 GCC 15.2.0 via winget + pacman |

---

## Final State

- `CGO_ENABLED=0 go build ./...` — passes
- `CGO_ENABLED=1 go build -tags fts5 ./...` (with GCC on PATH) — passes
- Git: 1 commit on `master`, 32 files tracked

---

## Blockers for Phase 02/03

- **GCC must be on PATH for CGO builds.** Future build commands need:
  `export PATH="/c/msys64/mingw64/bin:$PATH"` before `go build` / `wails build`.
  Phase 02/03 implementors must include this in any build/test scripts or document it in a `.env` or Makefile.

- **shadcn components not yet added** — `components/ui/` is empty. Phase 04 (UI components) will need to run `npx shadcn add <component>` from `frontend/` to populate it. The infrastructure (components.json, utils, CSS vars) is fully in place.

- **`tailwind.config.js` is a duplicate of `.ts`** — can be removed once it's confirmed shadcn CLI is no longer needed, or kept as CJS fallback.

---

## Unresolved Questions

- Should `clipboard-pro.exe` (CGO build artifact left in root) be added to `.gitignore`? Currently untracked.
- Phase plan references `getlantern/systray` but Wails ships its own systray — confirm which to use in implementation.
