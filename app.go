package main

import (
	"context"
	"fmt"
	"time"

	"clipboard-pro/internal/clipboard"
	"clipboard-pro/internal/config"
	"clipboard-pro/internal/server"
	"clipboard-pro/internal/storage"

	"github.com/getlantern/systray"
	hook "github.com/robotn/gohook"
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
}

// NewApp creates the App instance for Wails.
func NewApp() *App {
	return &App{}
}

// startup is called by Wails after the window is ready.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// --- Config ---
	cfg, err := config.Load()
	if err != nil {
		fmt.Println("[app] config load error:", err)
		return // cannot proceed without config
	}
	a.config = cfg

	// --- Database ---
	db, err := storage.InitDB(cfg.DataDir)
	if err != nil {
		fmt.Println("[app] db init error:", err)
		return
	}
	a.db = db
	a.repo = storage.NewRepository(db)

	// --- HTTP API server ---
	a.server = server.NewServer(a.repo, a.config)
	a.server.Start()

	// --- Clipboard monitor ---
	a.monitor = clipboard.NewMonitor(a.repo, cfg.DataDir)
	a.monitor.Start(ctx)

	// --- Periodic cleanup goroutine (cancelled in shutdown) ---
	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	a.cleanupCancel = cleanupCancel
	go a.runCleanup(cleanupCtx, cfg.RetentionDays, cfg.MaxItems)

	// --- System tray ---
	go systray.Run(a.onTrayReady, a.onTrayExit)

	// --- Global hotkey (Ctrl+Shift+V) ---
	go a.registerHotkey()
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
	systray.Quit()
}

// onTrayReady sets up the system tray icon and menu.
func (a *App) onTrayReady() {
	systray.SetTitle("Clipboard Pro")
	systray.SetTooltip("Clipboard Pro")

	mShow := systray.AddMenuItem("Show", "Show the Clipboard Pro window")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit Clipboard Pro")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				runtime.WindowShow(a.ctx)
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

// --- Wails-bound methods ---

// GetHistory returns paginated clipboard history, pinned items first.
func (a *App) GetHistory(limit, offset int) []storage.ClipboardItem {
	items, err := a.repo.GetAll(limit, offset)
	if err != nil {
		fmt.Println("[app] GetHistory error:", err)
		return nil
	}
	return items
}

// Search performs FTS5 full-text search on clipboard content.
func (a *App) Search(query string) []storage.ClipboardItem {
	items, err := a.repo.Search(query, 100)
	if err != nil {
		fmt.Println("[app] Search error:", err)
		return nil
	}
	return items
}

// CopyItem writes the clipboard item back to the system clipboard.
func (a *App) CopyItem(id uint) error {
	item, err := a.repo.GetByID(id)
	if err != nil {
		return err
	}
	if item.Type == "text" {
		goclip.Write(goclip.FmtText, []byte(item.Content))
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
func (a *App) SaveConfig(cfg config.Config) error {
	a.config = &cfg
	return config.Save(&cfg)
}
