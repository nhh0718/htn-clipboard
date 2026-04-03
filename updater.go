package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

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
	result := UpdateInfo{Current: version}

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
	if result.DownloadURL == "" {
		for _, asset := range release.Assets {
			if strings.HasSuffix(asset.Name, ".exe") {
				result.DownloadURL = asset.BrowserDownloadURL
				break
			}
		}
	}
	if result.DownloadURL == "" {
		result.DownloadURL = release.HTMLURL
	}

	result.Available = isNewer(release.TagName, version)
	return result
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

// DownloadAndInstallUpdate downloads the installer silently in the background,
// then runs it with /S (NSIS silent install) flag and quits the app.
// This mimics how professional apps (VS Code, Discord, Notion) handle updates:
// background download → silent install → app quits → installer replaces → done.
func (a *App) DownloadAndInstallUpdate(downloadURL string) error {
	if downloadURL == "" {
		return fmt.Errorf("no download URL provided")
	}

	fmt.Printf("[updater] downloading: %s\n", downloadURL)
	runtime.EventsEmit(a.ctx, "update:progress", map[string]interface{}{
		"stage": "downloading", "percent": 0,
	})

	// GitHub release URLs redirect (302) to CDN — http.Client follows redirects by default.
	// Use a generous timeout for large files.
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("download error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download HTTP %d", resp.StatusCode)
	}

	// Save to temp directory
	tmpDir := os.TempDir()
	installerPath := filepath.Join(tmpDir, "clipboard-pro-installer.exe")
	outFile, err := os.Create(installerPath)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}

	// Track download progress
	totalSize := resp.ContentLength
	var downloaded int64
	buf := make([]byte, 32*1024) // 32KB buffer
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := outFile.Write(buf[:n]); writeErr != nil {
				outFile.Close()
				return fmt.Errorf("write file: %w", writeErr)
			}
			downloaded += int64(n)
			if totalSize > 0 {
				pct := int(float64(downloaded) / float64(totalSize) * 100)
				runtime.EventsEmit(a.ctx, "update:progress", map[string]interface{}{
					"stage": "downloading", "percent": pct,
				})
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			outFile.Close()
			return fmt.Errorf("read body: %w", readErr)
		}
	}
	outFile.Close()

	fmt.Printf("[updater] downloaded %d bytes → %s\n", downloaded, installerPath)

	// Verify it's a real PE executable (MZ magic bytes)
	f, err := os.Open(installerPath)
	if err != nil {
		return fmt.Errorf("verify open: %w", err)
	}
	magic := make([]byte, 2)
	f.Read(magic)
	f.Close()
	if string(magic) != "MZ" {
		return fmt.Errorf("downloaded file is not a valid Windows executable")
	}

	// Emit "installing" stage
	runtime.EventsEmit(a.ctx, "update:progress", map[string]interface{}{
		"stage": "installing", "percent": 100,
	})

	fmt.Println("[updater] launching installer with elevation...")

	// Use ShellExecute with "runas" verb to trigger UAC elevation.
	// NSIS installer needs admin rights to write to Program Files.
	if err := shellExecuteRunAs(installerPath, "/S"); err != nil {
		return fmt.Errorf("launch installer: %w", err)
	}

	// Give installer a moment to start, then quit so it can replace files
	time.Sleep(1 * time.Second)
	fmt.Println("[updater] quitting for silent install...")
	runtime.Quit(a.ctx)
	return nil
}
