//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	shell32          = syscall.NewLazyDLL("shell32.dll")
	procShellExecute = shell32.NewProc("ShellExecuteW")
)

// shellExecuteRunAs launches a program with UAC elevation ("Run as administrator").
func shellExecuteRunAs(exe string, args string) error {
	verb, _ := syscall.UTF16PtrFromString("runas")
	file, _ := syscall.UTF16PtrFromString(exe)
	params, _ := syscall.UTF16PtrFromString(args)

	ret, _, err := procShellExecute.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(params)),
		0,
		syscall.SW_HIDE,
	)

	// ShellExecute returns >32 on success
	if ret <= 32 {
		return fmt.Errorf("ShellExecute failed: %v (code %d)", err, ret)
	}
	return nil
}
