package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/pkg/browser"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// version is set at build time via -ldflags "-X main.version=vX.Y.Z".
// Defaults to "dev" for local development builds.
var version = "dev"

const (
	githubRepo   = "nhh0718/htn-clipboard"
	githubAPIURL = "https://api.github.com/repos/" + githubRepo + "/releases/latest"
)

// UpdateInfo holds the result of a version check against GitHub Releases.
type UpdateInfo struct {
	Available   bool   `json:"available"`
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	DownloadURL string `json:"downloadURL"`
	ReleaseURL  string `json:"releaseURL"`
	ReleaseNote string `json:"releaseNote"`
}

// githubRelease is the subset of GitHub's release JSON we care about.
type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Body    string `json:"body"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// GetVersion returns the current app version string.
func (a *App) GetVersion() string {
	return version
}

// CheckForUpdate queries the GitHub Releases API and compares the latest
// tag against the compiled-in version.
func (a *App) CheckForUpdate() UpdateInfo {
	result := UpdateInfo{
		Current: version,
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(githubAPIURL)
	if err != nil {
		fmt.Println("[updater] fetch error:", err)
		return result
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Println("[updater] GitHub API status:", resp.StatusCode)
		return result
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		fmt.Println("[updater] decode error:", err)
		return result
	}

	result.Latest = release.TagName
	result.ReleaseURL = release.HTMLURL
	result.ReleaseNote = release.Body

	// Find the Windows installer asset as the primary download link
	for _, asset := range release.Assets {
		if strings.Contains(asset.Name, "installer") {
			result.DownloadURL = asset.BrowserDownloadURL
			break
		}
	}
	// Fallback to .exe if no installer found
	if result.DownloadURL == "" {
		for _, asset := range release.Assets {
			if strings.HasSuffix(asset.Name, ".exe") {
				result.DownloadURL = asset.BrowserDownloadURL
				break
			}
		}
	}
	// Final fallback to release page
	if result.DownloadURL == "" {
		result.DownloadURL = release.HTMLURL
	}

	result.Available = isNewer(release.TagName, version)
	return result
}

// isNewer returns true if latest is a higher semver than current.
// Handles tags with or without "v" prefix (e.g. "v1.2.0" vs "1.2.0").
func isNewer(latest, current string) bool {
	latest = strings.TrimPrefix(latest, "v")
	current = strings.TrimPrefix(current, "v")

	if current == "dev" || current == "" {
		return true // dev builds always show update available
	}

	lParts := parseSemver(latest)
	cParts := parseSemver(current)

	for i := 0; i < 3; i++ {
		if lParts[i] > cParts[i] {
			return true
		}
		if lParts[i] < cParts[i] {
			return false
		}
	}
	return false
}

// parseSemver splits "1.2.3" into [1, 2, 3]. Returns [0,0,0] on parse failure.
func parseSemver(v string) [3]int {
	var parts [3]int
	_, _ = fmt.Sscanf(v, "%d.%d.%d", &parts[0], &parts[1], &parts[2])
	return parts
}

// checkUpdateBackground runs a silent update check after startup delay
// and emits a Wails event if a new version is available.
func (a *App) checkUpdateBackground() {
	time.Sleep(5 * time.Second)
	info := a.CheckForUpdate()
	if info.Available {
		fmt.Printf("[updater] new version available: %s → %s\n", info.Current, info.Latest)
		runtime.EventsEmit(a.ctx, "update:available", info)
	}
}

// DownloadAndInstallUpdate opens the installer download URL in the browser,
// waits a few seconds for the download to start, then quits the app
// so the installer can replace files.
func (a *App) DownloadAndInstallUpdate(downloadURL string) error {
	if downloadURL == "" {
		return fmt.Errorf("no download URL provided")
	}

	fmt.Printf("[updater] opening download URL: %s\n", downloadURL)

	// Open download link in default browser
	if err := browser.OpenURL(downloadURL); err != nil {
		return fmt.Errorf("open browser: %w", err)
	}

	// Emit countdown event — frontend shows "Đóng app sau 3s..."
	runtime.EventsEmit(a.ctx, "update:closing", 3)

	// Wait for download to start, then quit
	go func() {
		time.Sleep(3 * time.Second)
		fmt.Println("[updater] quitting app for update...")
		runtime.Quit(a.ctx)
	}()

	return nil
}
