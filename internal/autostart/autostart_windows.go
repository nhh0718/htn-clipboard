//go:build windows

package autostart

import (
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const regKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const appName = "ClipboardPro"

// Enable adds the current executable to Windows startup registry.
func Enable() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, regKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	return k.SetStringValue(appName, exe)
}

// Disable removes the current executable from Windows startup registry.
func Disable() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, regKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	return k.DeleteValue(appName)
}

// IsEnabled checks if the app is registered for startup.
func IsEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, regKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	_, _, err = k.GetStringValue(appName)
	return err == nil
}
