//go:build !windows

package main

import "fmt"

// shellExecuteRunAs is not supported on non-Windows platforms.
func shellExecuteRunAs(exe string, args string) error {
	return fmt.Errorf("auto-update installer not supported on this platform")
}
