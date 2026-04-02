//go:build !windows

package main

// startTray is a no-op on non-Windows platforms.
// getlantern/systray conflicts with Wails' AppDelegate on macOS,
// and is not needed on Linux where Wails handles the window lifecycle.
func (a *App) startTray() {}

// stopTray is a no-op on non-Windows platforms.
func (a *App) stopTray() {}

// registerHotkey is a no-op on non-Windows platforms.
// gohook requires CGO and has platform-specific dependencies.
func (a *App) registerHotkey() {}
