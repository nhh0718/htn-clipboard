//go:build !windows

package clipboard

// getSourceApp returns the foreground app name.
// Not implemented on non-Windows platforms — returns empty string.
func getSourceApp() string {
	return ""
}
