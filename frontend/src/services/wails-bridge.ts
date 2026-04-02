// Bridge module: re-exports Wails-generated bindings.
// The generated wailsjs/ files call window.go.main.App.X() which Wails
// guarantees to be available before any app JS executes.
// Stubs are used ONLY in plain-browser mode (no window.go present).

import type { ClipboardItem, AppConfig, SearchFilter, HealthStatus } from '../types/clipboard'
import * as appStubs from '../wailsjs-stubs/go-app-stubs'
import * as rtStubs from '../wailsjs-stubs/runtime-stubs'

export const inWails = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as Record<string, unknown>)['go'] !== 'undefined'

// ── App bindings ──────────────────────────────────────────────────────────────

function goApp() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).go.main.App
}

export function GetHistory(limit: number, offset: number): Promise<ClipboardItem[]> {
  return inWails() ? goApp().GetHistory(limit, offset) : appStubs.GetHistory(limit, offset)
}

export function Search(filter: SearchFilter): Promise<ClipboardItem[]> {
  return inWails() ? goApp().Search(filter) : appStubs.Search(filter)
}

export function CopyItem(id: number): Promise<void> {
  return inWails() ? goApp().CopyItem(id) : appStubs.CopyItem(id)
}

export function DeleteItem(id: number): Promise<void> {
  return inWails() ? goApp().DeleteItem(id) : appStubs.DeleteItem(id)
}

export function TogglePin(id: number): Promise<void> {
  return inWails() ? goApp().TogglePin(id) : appStubs.TogglePin(id)
}

export function GetConfig(): Promise<AppConfig> {
  return inWails() ? goApp().GetConfig() : appStubs.GetConfig()
}

export function SaveConfig(config: AppConfig): Promise<void> {
  return inWails() ? goApp().SaveConfig(config) : appStubs.SaveConfig(config)
}

export function GetHealth(): Promise<HealthStatus> {
  return inWails() ? goApp().GetHealth() : appStubs.GetHealth()
}

export function SetAlwaysOnTop(on: boolean): Promise<void> {
  return inWails() ? goApp().SetAlwaysOnTop(on) : Promise.resolve()
}

export function IsAlwaysOnTop(): Promise<boolean> {
  return inWails() ? goApp().IsAlwaysOnTop() : Promise.resolve(false)
}

// ── Runtime bindings ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const goRuntime = (): any => (window as any).runtime

export function EventsOn(
  eventName: string,
  callback: (...data: unknown[]) => void
): void {
  if (inWails()) {
    goRuntime()?.EventsOn(eventName, callback)
  } else {
    rtStubs.EventsOn(eventName, callback)
  }
}

export function EventsOff(eventName: string): void {
  if (inWails()) {
    goRuntime()?.EventsOff(eventName)
  } else {
    rtStubs.EventsOff(eventName)
  }
}
