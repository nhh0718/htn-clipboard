package main

import (
	"context"
	"embed"
	"fmt"
	"os"
	"time"

	"clipboard-pro/internal/autostart"
	"clipboard-pro/internal/clipboard"
	"clipboard-pro/internal/config"
	"clipboard-pro/internal/server"
	"clipboard-pro/internal/storage"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gorm.io/gorm"
	goclip "golang.design/x/clipboard"
)

// App is the Wails application struct. All exported methods are bound to the
// frontend and callable from JavaScript via the Wails bridge.
type App struct {
	ctx           context.Context
	config        *config.Config
	db            *gorm.DB
	repo          *storage.Repository
	monitor       *clipboard.Monitor
	server        *server.Server
	cleanupCancel context.CancelFunc
	startedAt     time.Time
	assets        *embed.FS // embedded frontend/dist, shared with HTTP server
	alwaysOnTop   bool
}

// NewApp creates the App instance for Wails.
func NewApp(assets *embed.FS) *App {
	return &App{assets: assets}
}

// startup is called by Wails after the window is ready.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.startedAt = time.Now()

	// --- Config ---
	cfg, err := config.Load()
	if err != nil {
		fmt.Println("[app] config load error:", err)
		return // cannot proceed without config
	}
	a.config = cfg

	// --- Autostart: sync registry with config ---
	syncAutoStart(cfg.AutoStart)

	// --- Database ---
	db, err := storage.InitDB(cfg.DataDir)
	if err != nil {
		fmt.Println("[app] db init error:", err)
		return
	}
	a.db = db
	a.repo = storage.NewRepository(db)

	// --- HTTP API server ---
	a.server = server.NewServer(a.repo, a.config, a.assets)
	a.server.OnChange = func(event string) {
		// Notify the Wails frontend to refresh when the HTTP API modifies data
		runtime.EventsEmit(ctx, "data:changed", event)
	}
	a.server.Start()

	// --- Clipboard monitor ---
	a.monitor = clipboard.NewMonitor(a.repo, cfg.DataDir)
	a.monitor.Start(ctx)

	// --- Periodic cleanup goroutine (cancelled in shutdown) ---
	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	a.cleanupCancel = cleanupCancel
	go a.runCleanup(cleanupCtx, cfg.RetentionDays, cfg.MaxItems)

	// --- System tray (Windows only, no-op on other platforms) ---
	a.startTray()

	// --- Global hotkey (Windows only, no-op on other platforms) ---
	go a.registerHotkey()

	// --- Background update check ---
	go a.checkUpdateBackground()
}

// shutdown is called by Wails before the process exits.
func (a *App) shutdown(ctx context.Context) {
	if a.cleanupCancel != nil {
		a.cleanupCancel()
	}
	if a.monitor != nil {
		a.monitor.Stop()
	}
	if a.server != nil {
		a.server.Stop(ctx)
	}
	if a.db != nil {
		sqlDB, err := a.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}
	a.stopTray()
}


// runCleanup periodically deletes old items and enforces the maxItems cap.
// Exits when ctx is cancelled (called from shutdown).
func (a *App) runCleanup(ctx context.Context, retentionDays, maxItems int) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := a.repo.DeleteOlderThan(retentionDays); err != nil {
				fmt.Println("[app] cleanup error:", err)
			}
			if maxItems > 0 {
				if err := a.repo.PruneToLimit(maxItems); err != nil {
					fmt.Println("[app] prune error:", err)
				}
			}
		}
	}
}

// syncAutoStart sets or removes the Windows startup registry entry.
func syncAutoStart(enabled bool) {
	if enabled {
		if err := autostart.Enable(); err != nil {
			fmt.Println("[app] autostart enable error:", err)
		}
	} else {
		if err := autostart.Disable(); err != nil {
			fmt.Println("[app] autostart disable error:", err)
		}
	}
}

// --- Wails-bound methods ---

// GetHistory returns paginated clipboard history, pinned items first.
// Always returns a non-nil slice so the frontend never receives JSON null.
func (a *App) GetHistory(limit, offset int) []storage.ClipboardItem {
	items, err := a.repo.GetAll(limit, offset)
	if err != nil {
		fmt.Println("[app] GetHistory error:", err)
		return []storage.ClipboardItem{}
	}
	if items == nil {
		return []storage.ClipboardItem{}
	}
	return items
}

// Search performs FTS5 full-text search with optional type and time filters.
// Always returns a non-nil slice so the frontend never receives JSON null.
func (a *App) Search(filter storage.SearchFilter) []storage.ClipboardItem {
	items, err := a.repo.Search(filter, 100)
	if err != nil {
		fmt.Println("[app] Search error:", err)
		return []storage.ClipboardItem{}
	}
	if items == nil {
		return []storage.ClipboardItem{}
	}
	return items
}

// CopyItem writes the clipboard item back to the system clipboard.
// Suppresses the monitor for 2 s so the programmatic write doesn't
// create a duplicate/ghost entry in the history.
func (a *App) CopyItem(id uint) error {
	item, err := a.repo.GetByID(id)
	if err != nil {
		return err
	}
	switch item.Type {
	case "text":
		goclip.Write(goclip.FmtText, []byte(item.Content))
	case "image":
		if item.FilePath == "" {
			return fmt.Errorf("image file path is empty")
		}
		data, err := os.ReadFile(item.FilePath)
		if err != nil {
			return fmt.Errorf("read image file: %w", err)
		}
		goclip.Write(goclip.FmtImage, data)
	}
	// Suppress monitor so this programmatic write isn't re-saved as new item
	if a.monitor != nil {
		a.monitor.SuppressNext()
	}
	return nil
}

// DeleteItem removes a clipboard item and its associated file if applicable.
func (a *App) DeleteItem(id uint) error {
	return a.repo.Delete(id)
}

// TogglePin flips the pinned state of a clipboard item.
func (a *App) TogglePin(id uint) error {
	return a.repo.TogglePin(id)
}

// GetConfig returns the current application configuration.
func (a *App) GetConfig() *config.Config {
	return a.config
}

// SaveConfig persists updated configuration to disk.
// Also syncs autostart registry entry when the setting changes.
func (a *App) SaveConfig(cfg config.Config) error {
	oldAutoStart := a.config.AutoStart
	a.config = &cfg
	if err := config.Save(&cfg); err != nil {
		return err
	}
	// Sync autostart if the setting changed
	if cfg.AutoStart != oldAutoStart {
		syncAutoStart(cfg.AutoStart)
	}
	return nil
}

// HealthCheck returns system health info for the frontend.
type HealthStatus struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Uptime    string `json:"uptime"`
	DbItems   int64  `json:"dbItems"`
	ApiPort   int    `json:"apiPort"`
	Monitor   bool   `json:"monitor"`
	AutoStart bool   `json:"autoStart"`
}

// GetHealth returns current system health status.
func (a *App) GetHealth() HealthStatus {
	count, _ := a.repo.Count()
	uptime := time.Since(a.startedAt).Truncate(time.Second).String()
	return HealthStatus{
		Status:    "running",
		Version:   version,
		Uptime:    uptime,
		DbItems:   count,
		ApiPort:   a.config.Port,
		Monitor:   a.monitor != nil,
		AutoStart: autostart.IsEnabled(),
	}
}

// SetAlwaysOnTop toggles the window always-on-top (pin/widget mode).
func (a *App) SetAlwaysOnTop(on bool) {
	a.alwaysOnTop = on
	runtime.WindowSetAlwaysOnTop(a.ctx, on)
}

// IsAlwaysOnTop returns current always-on-top state.
func (a *App) IsAlwaysOnTop() bool {
	return a.alwaysOnTop
}
