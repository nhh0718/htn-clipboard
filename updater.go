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

// CheckForUpdate queries the GitHub Releases API and compares versions.
func (a *App) CheckForUpdate() UpdateInfo {
	result := UpdateInfo{Current: version}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(githubAPIURL)
	if err != nil {
		fmt.Println("[updater] fetch error:", err)
		return result
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return result
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return result
	}

	result.Latest = release.TagName
	result.ReleaseURL = release.HTMLURL
	result.ReleaseNote = release.Body

	// Find installer download link
	for _, asset := range release.Assets {
		if strings.Contains(asset.Name, "installer") {
			result.DownloadURL = asset.BrowserDownloadURL
			break
		}
	}
	if result.DownloadURL == "" {
		result.DownloadURL = release.HTMLURL
	}

	result.Available = isNewer(release.TagName, version)
	return result
}

// OpenUpdatePage opens the download URL in the default browser.
// No exe download, no ShellExecute, no privilege escalation.
func (a *App) OpenUpdatePage(url string) error {
	if url == "" {
		return fmt.Errorf("no URL provided")
	}
	return browser.OpenURL(url)
}

// isNewer returns true if latest is a higher semver than current.
func isNewer(latest, current string) bool {
	latest = strings.TrimPrefix(latest, "v")
	current = strings.TrimPrefix(current, "v")
	if current == "dev" || current == "" {
		return true
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

func parseSemver(v string) [3]int {
	var parts [3]int
	_, _ = fmt.Sscanf(v, "%d.%d.%d", &parts[0], &parts[1], &parts[2])
	return parts
}

// checkUpdateBackground runs a silent version check after startup.
func (a *App) checkUpdateBackground() {
	time.Sleep(5 * time.Second)
	info := a.CheckForUpdate()
	if info.Available {
		fmt.Printf("[updater] new version available: %s → %s\n", info.Current, info.Latest)
		runtime.EventsEmit(a.ctx, "update:available", info)
	}
}
