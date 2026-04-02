//go:build !windows

package autostart

// Enable is a no-op on non-Windows platforms.
func Enable() error { return nil }

// Disable is a no-op on non-Windows platforms.
func Disable() error { return nil }

// IsEnabled always returns false on non-Windows platforms.
func IsEnabled() bool { return false }
