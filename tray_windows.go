//go:build windows

package main

import (
	_ "embed"
	"fmt"

	"github.com/getlantern/systray"
	"github.com/pkg/browser"
	hook "github.com/robotn/gohook"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIconData []byte

// startTray launches the system tray icon and menu on Windows.
func (a *App) startTray() {
	go systray.Run(a.onTrayReady, a.onTrayExit)
}

// stopTray shuts down the system tray.
func (a *App) stopTray() {
	systray.Quit()
}

// onTrayReady sets up the system tray icon and menu.
func (a *App) onTrayReady() {
	systray.SetIcon(trayIconData)
	systray.SetTitle("Clipboard Pro")
	systray.SetTooltip("Clipboard Pro — Running")

	mShow := systray.AddMenuItem("Show Window", "Show the Clipboard Pro app window")
	mDashboard := systray.AddMenuItem("Open Dashboard", "Open web dashboard in browser")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit Clipboard Pro")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				runtime.WindowShow(a.ctx)
			case <-mDashboard.ClickedCh:
				_ = browser.OpenURL(fmt.Sprintf("http://localhost:%d", a.config.Port))
			case <-mQuit.ClickedCh:
				runtime.Quit(a.ctx)
				return
			}
		}
	}()
}

// onTrayExit is called when the systray is quitting.
func (a *App) onTrayExit() {}

// registerHotkey listens for Ctrl+Shift+V and toggles window visibility.
func (a *App) registerHotkey() {
	hook.Register(hook.KeyDown, []string{"ctrl", "shift", "v"}, func(e hook.Event) {
		runtime.WindowShow(a.ctx)
	})
	s := hook.Start()
	<-hook.Process(s)
}
