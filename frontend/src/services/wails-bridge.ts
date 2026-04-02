// Bridge module: resolves real Wails bindings when running inside the desktop
// runtime, falls back to stubs when running in a plain browser / dev server.
//
// All app code imports from here — never directly from wailsjs or stubs.

import type { ClipboardItem, AppConfig } from '../types/clipboard'

// Stubs are always imported so the module graph is static (no dynamic await).
import * as appStubs from '../wailsjs-stubs/go-app-stubs'
import * as rtStubs from '../wailsjs-stubs/runtime-stubs'

// Detect whether the Wails JS bridge is present at runtime.
function isWailsRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>)['go'] !== 'undefined'
  )
}

// ── App bindings ──────────────────────────────────────────────────────────────

function wailsApp() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.main.App
}

export function GetHistory(limit: number, offset: number): Promise<ClipboardItem[]> {
  if (isWailsRuntime()) return wailsApp().GetHistory(limit, offset)
  return appStubs.GetHistory(limit, offset)
}

export function Search(query: string): Promise<ClipboardItem[]> {
  if (isWailsRuntime()) return wailsApp().Search(query)
  return appStubs.Search(query)
}

export function CopyItem(id: number): Promise<void> {
  if (isWailsRuntime()) return wailsApp().CopyItem(id)
  return appStubs.CopyItem(id)
}

export function DeleteItem(id: number): Promise<void> {
  if (isWailsRuntime()) return wailsApp().DeleteItem(id)
  return appStubs.DeleteItem(id)
}

export function TogglePin(id: number): Promise<void> {
  if (isWailsRuntime()) return wailsApp().TogglePin(id)
  return appStubs.TogglePin(id)
}

export function GetConfig(): Promise<AppConfig> {
  if (isWailsRuntime()) return wailsApp().GetConfig()
  return appStubs.GetConfig()
}

export function SaveConfig(config: AppConfig): Promise<void> {
  if (isWailsRuntime()) return wailsApp().SaveConfig(config)
  return appStubs.SaveConfig(config)
}

// ── Runtime bindings ──────────────────────────────────────────────────────────

function wailsRuntime() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).runtime
}

export function EventsOn(
  eventName: string,
  callback: (...data: unknown[]) => void
): void {
  if (isWailsRuntime()) {
    wailsRuntime()?.EventsOn(eventName, callback)
    return
  }
  rtStubs.EventsOn(eventName, callback)
}

export function EventsOff(eventName: string): void {
  if (isWailsRuntime()) {
    wailsRuntime()?.EventsOff(eventName)
    return
  }
  rtStubs.EventsOff(eventName)
}
