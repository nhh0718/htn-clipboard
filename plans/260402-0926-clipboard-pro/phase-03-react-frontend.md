# Phase 03: React Frontend UI

## Context Links

- [Plan Overview](plan.md)
- [Architecture Brainstorm](../reports/brainstorm-260402-0926-clipboard-pro-architecture.md)

## Overview

- **Priority:** P1 — user-facing UI
- **Status:** completed
- **Effort:** 3h
- **Blocked by:** Phase 01
- **Runs parallel with:** Phase 02 (Group B)
- **Description:** Build React/TypeScript UI for clipboard history — virtual scroll list, search, item cards, settings panel.

## Key Insights

- Wails provides `window.go` bindings auto-generated in `frontend/wailsjs/`
- Use `@tanstack/react-virtual` for performant virtual scroll (1000+ items)
- Wails runtime events via `EventsOn("clipboard:new", handler)` for real-time updates
- Dark mode default — Tailwind `dark:` classes
- shadcn/ui for consistent, accessible components

## Requirements

### Functional
- Display clipboard history as scrollable list (virtual scroll)
- Search bar with debounced FTS5 query
- Click item to re-copy to clipboard
- Pin/unpin and delete items
- Image thumbnails for image items
- Settings panel for config
- Keyboard navigation (arrows, Enter, Esc)
- Real-time updates when new clipboard item captured

### Non-functional
- Smooth scroll at 60fps for 1000+ items
- Search debounce 300ms
- Responsive layout (400x600 default window)

## Architecture

```
App.tsx
├── SearchBar.tsx (debounced input → Go Search())
├── ClipboardList.tsx (virtual scroll → Go GetHistory())
│   └── ClipboardItem.tsx (card: preview, copy, pin, delete)
└── SettingsPanel.tsx (config read/write)
```

## Related Code Files

### Create
- `frontend/src/types/clipboard.ts`
- `frontend/src/components/SearchBar.tsx`
- `frontend/src/components/ClipboardItem.tsx`
- `frontend/src/components/ClipboardList.tsx`
- `frontend/src/components/SettingsPanel.tsx`

### Modify
- `frontend/src/App.tsx`
- `frontend/src/App.css` or `frontend/src/index.css` (Tailwind setup)
- `frontend/tailwind.config.js`

## Implementation Steps

### Step 1: TypeScript Types (`frontend/src/types/clipboard.ts`)

1. Define interfaces matching Go models:
   ```typescript
   export interface ClipboardItem {
     id: number;
     type: 'text' | 'image';
     content: string;
     filePath: string;
     contentHash: string;
     sourceApp: string;
     isPinned: boolean;
     createdAt: string;
   }

   export interface Config {
     port: number;
     authToken: string;
     retentionDays: number;
     maxItems: number;
     hotkey: string;
     dataDir: string;
   }
   ```

### Step 2: Tailwind + Theme Setup

1. Configure `tailwind.config.js`:
   - Content paths: `./src/**/*.{ts,tsx}`
   - Dark mode: `class`
   - Custom colors for app theme
2. Update `index.css` with Tailwind directives
3. Set `dark` class on root `<html>` element (dark mode default)
4. Configure shadcn/ui theme tokens

### Step 3: SearchBar Component (`frontend/src/components/SearchBar.tsx`)

1. Text input with search icon
2. Debounce input changes by 300ms (use `setTimeout`/`clearTimeout` or custom hook)
3. On debounced value change: call `Search(query)` via Wails binding
4. Pass results up to parent via callback
5. Clear button to reset search
6. Focus on Ctrl+F or `/` key

### Step 4: ClipboardItem Component (`frontend/src/components/ClipboardItem.tsx`)

1. Props: `item: ClipboardItem`, `onCopy`, `onDelete`, `onTogglePin`
2. Display:
   - Text items: truncated preview (first 200 chars), monospace font
   - Image items: thumbnail (load from `filePath` via Wails asset serving)
   - Timestamp (relative: "2m ago", "1h ago")
   - Type badge (text/image)
3. Actions:
   - Click card → call `CopyItem(id)`, show brief "Copied!" feedback
   - Pin button → call `TogglePin(id)`, toggle icon
   - Delete button → call `DeleteItem(id)`, remove from list
4. Visual: pinned items get accent border/highlight

### Step 5: ClipboardList Component (`frontend/src/components/ClipboardList.tsx`)

1. Use `@tanstack/react-virtual` for virtualizer:
   - Estimated item height: 80px (text), 120px (image)
   - Overscan: 5 items
2. Load initial 50 items via `GetHistory(50, 0)`
3. Infinite scroll: load more when scrolled near bottom
4. Accept `items` prop (from parent) — can be search results or full history
5. Empty state: "No clipboard history yet" message
6. Pinned items float to top of list

### Step 6: SettingsPanel Component (`frontend/src/components/SettingsPanel.tsx`)

1. Toggle panel visibility via gear icon in header
2. Fields:
   - Port (read-only display)
   - Auth token (read-only, copy button)
   - Retention days (number input)
   - Max items (number input)
   - Hotkey display (read-only)
   - Data directory (read-only)
3. Save button → call `SaveConfig(config)` via Wails binding
4. Use shadcn/ui `Input`, `Button`, `Card` components

### Step 7: App.tsx Integration

1. State management:
   - `items: ClipboardItem[]` — current displayed list
   - `searchQuery: string` — active search
   - `isSearching: boolean` — search mode flag
   - `showSettings: boolean` — settings panel toggle
2. Real-time updates:
   - `EventsOn("clipboard:new", (item) => { prepend to items })`
   - Only prepend if not in search mode
3. Keyboard navigation:
   - Arrow up/down: move selection
   - Enter: copy selected item
   - Escape: close window (Wails `WindowHide()`) or exit search
4. Layout:
   ```
   ┌──────────────────────┐
   │ [Search...] [⚙️]     │  ← header
   ├──────────────────────┤
   │ Item 1 (pinned)      │
   │ Item 2               │  ← virtual scroll list
   │ Item 3               │
   │ ...                  │
   └──────────────────────┘
   ```
5. Window dimensions: 400w x 600h, no resize (or min 300x400)

## Todo List

- [x] Define TypeScript interfaces (ClipboardItem, Config)
- [x] Setup Tailwind CSS with dark mode
- [x] Initialize shadcn/ui components
- [x] Build SearchBar with debounce
- [x] Build ClipboardItem card (text + image)
- [x] Build ClipboardList with virtual scroll
- [x] Build SettingsPanel
- [x] Wire App.tsx with Wails bindings
- [x] Add Wails event listener for clipboard:new
- [x] Implement keyboard navigation
- [x] Add "Copied!" toast/feedback
- [x] Style with dark theme
- [x] Test with mock data (before backend ready)

## Success Criteria

- Virtual scroll renders 1000 items smoothly (60fps)
- Search returns results within 300ms of typing stop
- Click to copy works and shows feedback
- Pin/delete actions update list immediately
- Real-time clipboard:new events prepend items
- Keyboard navigation works (arrows, Enter, Esc)
- Dark mode looks polished

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Wails binding types out of sync with Go | Medium | Generate types from Go structs; keep interfaces manually synced |
| Virtual scroll perf with images | Low | Lazy load thumbnails, fixed height estimates |
| shadcn/ui version conflicts | Low | Pin versions in package.json |
| Image serving from Wails | Medium | Test Wails asset protocol for local file access |

## Security Considerations

- Auth token displayed in settings — use masked field with copy button
- No external API calls from frontend

## Next Steps

- Can develop with mock data in parallel with Phase 02
- Full integration once Wails bindings from Phase 02 are available
- Phase 06 (Build) depends on frontend being complete
