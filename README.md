# Clipboard Pro

Cross-platform clipboard history manager — Desktop app + Chrome extension.

## Description

Clipboard Pro is a desktop application built with [Wails v2](https://wails.io) (Go + React) that keeps a searchable history of everything you copy. All data is stored locally in SQLite with FTS5 full-text search. A companion Chrome extension lets you send web content directly to your clipboard history.

## Features

- Full clipboard history — text and images
- Fast full-text search (SQLite FTS5)
- Pin important entries to keep them at the top
- Image capture and preview
- System tray icon with quick-access menu
- Global hotkey `Ctrl+Shift+V` to open the window from anywhere
- Chrome browser extension to clip web content
- Local-only storage — no cloud, no telemetry

## Installation

Download the latest release from the [GitHub Releases](../../releases) page.

**Windows**
1. Download `clipboard-pro-windows-amd64.exe`
2. Run the executable — no installer required

**macOS**
1. Download the macOS build
2. Move `clipboard-pro.app` to `/Applications`
3. Launch from Applications or Spotlight

## Browser Extension Setup

1. Download `clipboard-pro-extension-vX.X.X.zip` from Releases
2. Unzip the archive
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked** and select the unzipped `dist/` folder
6. Open the desktop app, go to **Settings**, and copy the auth token
7. Paste the token into the extension's settings popup

## Usage

| Action | How |
|--------|-----|
| Open history | Press `Ctrl+Shift+V` (global hotkey) |
| Search | Type in the search bar at the top |
| Pin an entry | Click the pin icon on any item |
| Access via tray | Click the system tray icon |
| Quit | Right-click tray icon → Quit |

## Configuration

Config file location: `~/.clipboard-pro/config.json`

| Field | Default | Description |
|-------|---------|-------------|
| `hotkey` | `Ctrl+Shift+V` | Global hotkey to toggle window |
| `max_history` | `1000` | Maximum number of history entries |
| `port` | `45678` | Local HTTP port for extension communication |
| `launch_at_startup` | `true` | Start with system |
| `capture_images` | `true` | Save image clipboard entries |

## Building from Source

**Prerequisites**
- Go 1.21+
- Node.js 18+
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- GCC (Windows: [MinGW-w64](https://www.mingw-w64.org/), macOS: Xcode Command Line Tools)

**Build desktop app**
```bash
wails build -tags fts5
```

**Build browser extension**
```bash
cd extension
npm ci
npm run build
```

## License

MIT — see [LICENSE](LICENSE)
