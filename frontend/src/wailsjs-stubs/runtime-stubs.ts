// Stub for Wails runtime bindings used outside the Wails desktop runtime.

type EventCallback = (...data: unknown[]) => void
const listeners: Record<string, EventCallback[]> = {}

export function EventsOn(eventName: string, callback: EventCallback): void {
  if (!listeners[eventName]) listeners[eventName] = []
  listeners[eventName].push(callback)
}

export function EventsOff(eventName: string): void {
  delete listeners[eventName]
}

/** Trigger stub events from the browser console for manual testing. */
export function _emitStub(eventName: string, ...data: unknown[]): void {
  ;(listeners[eventName] ?? []).forEach((cb) => cb(...data))
}
