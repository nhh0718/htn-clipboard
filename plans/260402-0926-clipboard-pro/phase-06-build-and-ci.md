# Phase 06: Build, CI & GitHub Release

## Context Links

- [Plan Overview](plan.md)

## Overview

- **Priority:** P2 — distribution
- **Status:** completed
- **Effort:** 1.5h
- **Blocked by:** Phase 02, 03, 05
- **Description:** GitHub Actions CI/CD pipeline for cross-platform builds, extension packaging, and GitHub Releases.

## Key Insights

- Wails v2 cross-compilation: `wails build -platform {os}/amd64`
- Windows: outputs `.exe`; macOS: outputs `.app` (bundle into `.dmg` via `create-dmg`)
- CGO_ENABLED=1 required for go-sqlite3 and gohook — need platform-specific C compiler in CI
- Extension: simple zip of `dist/` folder

## Requirements

### Functional
- CI builds on push to `main` and tag push `v*`
- Produces Windows `.exe` and macOS `.dmg` binaries
- Produces extension `.zip`
- Creates GitHub Release with all artifacts on tag push

### Non-functional
- Build completes in <10 minutes
- Artifacts properly named with version

## Architecture

```
.github/workflows/
└── build.yml
    ├── Job: build-desktop (matrix: windows, macos)
    │   └── wails build → upload artifact
    ├── Job: build-extension
    │   └── npm build + zip → upload artifact
    └── Job: release (on tag only)
        └── download artifacts → create GitHub Release
```

## Related Code Files

### Create
- `.github/workflows/build.yml`

### Modify
- `README.md` — installation instructions, usage guide

## Implementation Steps

### Step 1: GitHub Actions Workflow (`.github/workflows/build.yml`)

1. Trigger:
   ```yaml
   on:
     push:
       branches: [main]
       tags: ['v*']
   ```

2. **Job: build-desktop**
   ```yaml
   strategy:
     matrix:
       os: [windows-latest, macos-latest]
   steps:
     - Checkout
     - Setup Go 1.21+
     - Setup Node 18+
     - Install Wails CLI
     - Install frontend deps (cd frontend && npm install)
     - Build: wails build -platform {os}/amd64
     - Upload artifact (build/bin/*)
   ```
   - Windows: artifact is `clipboard-pro.exe`
   - macOS: artifact is `Clipboard Pro.app` — optionally wrap in `.dmg`

3. **Job: build-extension**
   ```yaml
   steps:
     - Checkout
     - Setup Node 18+
     - cd extension && npm install && npm run build
     - zip -r clipboard-pro-extension.zip dist/
     - Upload artifact
   ```

4. **Job: release** (only on tag push)
   ```yaml
   if: startsWith(github.ref, 'refs/tags/v')
   needs: [build-desktop, build-extension]
   steps:
     - Download all artifacts
     - Create GitHub Release with gh CLI or actions/create-release
     - Upload binaries and extension zip to release
   ```

### Step 2: Build Tags

1. Ensure `go build` uses `-tags fts5` for SQLite FTS5 support
2. Set CGO_ENABLED=1 in CI environment
3. Windows CI: install GCC via `chocolatey install mingw` or use `msys2` action
4. macOS CI: Xcode CLT provides `cc` (pre-installed on macos-latest)

### Step 3: README.md

1. Project title + description
2. Screenshots (placeholder)
3. Installation:
   - Download from GitHub Releases
   - Windows: run `.exe` installer
   - macOS: drag `.app` to Applications
4. Browser extension setup:
   - Download `.zip` from Releases
   - Chrome: `chrome://extensions` → Developer mode → Load unpacked
   - Copy auth token from desktop app Settings
5. Usage:
   - Global hotkey: `Ctrl+Shift+V` (Windows), `Cmd+Shift+V` (macOS)
   - Search: type in search bar
   - System tray: right-click for menu
6. Configuration:
   - Config file location: `~/.clipboard-pro/config.json`
   - Available settings
7. Building from source:
   - Prerequisites: Go 1.21+, Node 18+, Wails CLI, GCC
   - `wails build`

## Todo List

- [x] Create `.github/workflows/build.yml`
- [x] Configure matrix build (Windows + macOS)
- [x] Setup CGO/GCC in CI for each platform
- [x] Add FTS5 build tag to wails build command
- [x] Extension build + zip job
- [x] Release job (tag-triggered)
- [x] Write README.md — install, usage, config, build-from-source
- [x] Test CI pipeline with push to main
- [x] Test release flow with test tag

## Success Criteria

- Push to main triggers build, all jobs green
- Tag push creates GitHub Release with:
  - `clipboard-pro-windows-amd64.exe`
  - `clipboard-pro-macos-amd64.dmg` (or `.app.zip`)
  - `clipboard-pro-extension-v{version}.zip`
- README has clear install and usage instructions
- Build completes in <10 minutes

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| CGO cross-compilation in CI | Medium | Use native runners per platform (matrix), not cross-compile |
| macOS code signing | Medium | Skip for v1; add Developer ID signing later |
| GCC install slow on Windows CI | Low | Use pre-installed mingw on windows-latest |
| Wails build caching | Low | Cache Go modules and npm dependencies |

## Security Considerations

- No secrets in build artifacts
- GitHub Release artifacts are public — no embedded tokens
- Extension zip should not contain source maps in production

## Next Steps

- After v1 release: add auto-update mechanism
- Add macOS code signing + notarization for distribution
- Consider Chrome Web Store submission for extension
- Linux builds (AppImage) as future enhancement
