# Phase 05: Browser Extension (Chrome MV3)

## Context Links

- [Plan Overview](plan.md)
- [Technical Research — IPC](../reports/researcher-260402-0934-clipboard-manager-research.md)

## Overview

- **Priority:** P2 — value-add feature
- **Status:** completed
- **Effort:** 2h
- **Blocked by:** Phase 04 (needs HTTP API)
- **Description:** Chrome MV3 extension with popup showing clipboard text history. Connects to desktop app via localhost HTTP API.

## Key Insights

- MV3 requires service worker (not background page)
- `chrome.storage.local` for persisting auth token
- `host_permissions` needed for `http://localhost:27843/*`
- Extension only shows text items (images handled by desktop app)
- Must handle desktop app offline gracefully

## Requirements

### Functional
- Popup shows recent text clipboard items from desktop API
- Search input filters items via API search endpoint
- Click item to copy to clipboard (via API paste endpoint)
- Settings: input field for auth token
- Connection status indicator (green/red)
- Error state when desktop app not running

### Non-functional
- Popup loads history within 500ms
- Clean, minimal UI matching desktop app style

## Architecture

```
extension/
├── manifest.json        (MV3 config)
├── popup/
│   ├── popup.html       (popup UI)
│   ├── popup.ts         (popup logic)
│   └── popup.css        (styles)
└── background/
    └── service-worker.ts (API client wrapper)
```

## Related Code Files

### Create
- `extension/manifest.json`
- `extension/popup/popup.html`
- `extension/popup/popup.ts`
- `extension/popup/popup.css`
- `extension/background/service-worker.ts`
- `extension/tsconfig.json`
- `extension/package.json`

## Implementation Steps

### Step 1: Project Setup

1. Create `extension/package.json` with TypeScript + build tooling:
   ```json
   {
     "scripts": {
       "build": "tsc && cp popup/popup.html dist/popup/ && cp popup/popup.css dist/popup/",
       "watch": "tsc --watch"
     },
     "devDependencies": {
       "typescript": "^5.0.0"
     }
   }
   ```
2. Create `extension/tsconfig.json`:
   - Target: ES2020
   - Module: ES2020
   - OutDir: `dist/`
   - Include: `popup/**/*.ts`, `background/**/*.ts`

### Step 2: Manifest (`extension/manifest.json`)

1. MV3 manifest:
   ```json
   {
     "manifest_version": 3,
     "name": "Clipboard Pro",
     "version": "1.0.0",
     "description": "Access your Clipboard Pro history from the browser",
     "permissions": ["clipboardWrite", "storage"],
     "host_permissions": ["http://localhost:27843/*"],
     "action": {
       "default_popup": "popup/popup.html",
       "default_icon": "icons/icon48.png"
     },
     "background": {
       "service_worker": "background/service-worker.js"
     },
     "icons": {
       "16": "icons/icon16.png",
       "48": "icons/icon48.png",
       "128": "icons/icon128.png"
     }
   }
   ```

### Step 3: Service Worker (`extension/background/service-worker.ts`)

1. API client class:
   ```typescript
   class ClipboardProAPI {
     private baseUrl: string;
     private token: string;

     async getHistory(limit: number, offset: number): Promise<...>
     async search(query: string, limit: number): Promise<...>
     async paste(id: number): Promise<...>
     async ping(): Promise<boolean>
   }
   ```
2. Load token from `chrome.storage.local` on init
3. Expose via `chrome.runtime.onMessage` listener:
   - Messages: `{action: "getHistory", ...}`, `{action: "search", ...}`, `{action: "paste", ...}`, `{action: "ping"}`
4. Retry logic: 1 retry with 500ms delay on network error

### Step 4: Popup HTML (`extension/popup/popup.html`)

1. Structure:
   ```html
   <div id="app">
     <header>
       <input id="search" placeholder="Search clipboard..." />
       <button id="settings-btn">⚙</button>
     </header>
     <div id="status"></div>
     <div id="items-list"></div>
     <div id="settings-panel" hidden>
       <input id="token-input" placeholder="Auth token" />
       <button id="save-token">Save</button>
     </div>
   </div>
   ```
2. Fixed width: 360px, max height: 500px

### Step 5: Popup Logic (`extension/popup/popup.ts`)

1. On popup open:
   - Send `{action: "ping"}` to service worker
   - If connected: load history (20 items)
   - If not connected: show "Desktop app not running" error
2. Render items:
   - Each item: truncated text (150 chars), timestamp, click handler
   - Click → send `{action: "paste", id: item.id}` → show "Copied!" toast
3. Search:
   - Debounce 300ms
   - Send `{action: "search", query, limit: 20}` to service worker
   - Replace items list with results
4. Settings:
   - Toggle settings panel
   - Load token from `chrome.storage.local`
   - Save token on button click
5. Connection status:
   - Green dot + "Connected" or Red dot + "Disconnected"

### Step 6: Popup Styles (`extension/popup/popup.css`)

1. Dark theme matching desktop app
2. Item hover state
3. Scrollable items list (max-height with overflow-y)
4. Toast notification for "Copied!"
5. Minimal, clean design

### Step 7: Build & Load

1. `npm run build` in extension dir
2. Load unpacked extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`
3. Test all flows manually

## Todo List

- [x] Setup extension project (package.json, tsconfig)
- [x] Create manifest.json (MV3)
- [x] Implement service-worker.ts (API client + message handler)
- [x] Create popup.html structure
- [x] Implement popup.ts (load history, search, copy, settings)
- [x] Style popup.css (dark theme)
- [x] Token management (save/load from chrome.storage.local)
- [x] Connection status indicator
- [x] Error state for offline desktop app
- [x] "Copied!" toast feedback
- [x] Build and test in Chrome
- [x] Create placeholder icons (16, 48, 128px)

## Success Criteria

- Extension loads in Chrome without errors
- Popup shows history from desktop API within 500ms
- Search filters items correctly
- Click to copy works
- Token persists across popup open/close
- Offline state shows clear error message
- Clean, dark-themed UI

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| CORS blocked for localhost | Low | Chrome allows; test early |
| MV3 service worker idle timeout | Medium | Service worker wakes on message; stateless API calls |
| Mixed content (HTTPS page + HTTP API) | Low | Chrome allows localhost HTTP |
| Token entry UX friction | Medium | Desktop settings panel shows token for easy copy |

## Security Considerations

- Token stored in `chrome.storage.local` (encrypted by Chrome)
- Only communicates with `localhost:27843` (host_permissions enforced)
- No external network requests
- clipboardWrite permission for paste functionality

## Next Steps

- Phase 06 (Build/CI) packages extension as zip for distribution
- Consider Firefox MV3 port in future version
