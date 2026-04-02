package clipboard

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"sync"
	"time"

	"clipboard-pro/internal/storage"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	goclip "golang.design/x/clipboard"
)

const (
	pollInterval = 500 * time.Millisecond
	maxImageSize = 10 * 1024 * 1024 // 10 MB
)

// Monitor watches the system clipboard and persists new items.
type Monitor struct {
	repo          *storage.Repository
	dataDir       string
	lastTextHash  string // tracks last-seen text to avoid duplicates
	lastImageHash string // tracks last-seen image to avoid duplicates
	ctx           context.Context
	cancel        context.CancelFunc

	// suppressMu guards suppressUntil — allows CopyItem to silence the monitor
	// for 2 s so a programmatic write doesn't create a ghost entry.
	suppressMu    sync.Mutex
	suppressUntil time.Time
}

// NewMonitor creates a Monitor. Call Start to begin watching.
func NewMonitor(repo *storage.Repository, dataDir string) *Monitor {
	return &Monitor{repo: repo, dataDir: dataDir}
}

// SuppressNext tells the monitor to ignore clipboard changes for 2 seconds.
// Call this immediately after writing to the clipboard programmatically.
func (m *Monitor) SuppressNext() {
	m.suppressMu.Lock()
	m.suppressUntil = time.Now().Add(2 * time.Second)
	m.suppressMu.Unlock()
}

// isSuppressed returns true if we are inside a suppression window.
func (m *Monitor) isSuppressed() bool {
	m.suppressMu.Lock()
	defer m.suppressMu.Unlock()
	return time.Now().Before(m.suppressUntil)
}

// Start launches the clipboard polling goroutine.
// wailsCtx is used for runtime event emission; it must be the context
// provided by Wails in app.startup.
func (m *Monitor) Start(wailsCtx context.Context) {
	if err := goclip.Init(); err != nil {
		fmt.Println("[clipboard] init error:", err)
		return
	}

	m.ctx, m.cancel = context.WithCancel(context.Background())
	go m.poll(wailsCtx)
}

// Stop signals the polling goroutine to exit.
func (m *Monitor) Stop() {
	if m.cancel != nil {
		m.cancel()
	}
}

// poll runs the main clipboard watch loop.
func (m *Monitor) poll(wailsCtx context.Context) {
	for {
		select {
		case <-m.ctx.Done():
			return
		case <-time.After(pollInterval):
			if m.isSuppressed() {
				// still in suppression window — update hashes so we don't
				// emit after the window ends, but don't persist or emit events.
				m.syncHashesOnly()
				continue
			}
			m.checkText(wailsCtx)
			m.checkImage(wailsCtx)
		}
	}
}

// syncHashesOnly updates lastTextHash / lastImageHash without saving or emitting.
// Called during suppression windows so we swallow the programmatic write silently.
func (m *Monitor) syncHashesOnly() {
	if data := goclip.Read(goclip.FmtText); len(data) > 0 {
		m.lastTextHash = hashBytes(data)
	}
	if data := goclip.Read(goclip.FmtImage); len(data) > 0 {
		m.lastImageHash = hashBytes(data)
	}
}

// checkText reads the current text clipboard and saves if it changed.
func (m *Monitor) checkText(wailsCtx context.Context) {
	data := goclip.Read(goclip.FmtText)
	if len(data) == 0 {
		return
	}

	hash := hashBytes(data)
	if hash == m.lastTextHash {
		return
	}
	// Update hash immediately so rapid changes don't double-fire.
	m.lastTextHash = hash

	item := &storage.ClipboardItem{
		Type:        "text",
		Content:     string(data),
		ContentHash: hash,
		SourceApp:   getSourceApp(),
		CreatedAt:   time.Now(),
	}

	if err := m.repo.Save(item); err != nil {
		fmt.Println("[clipboard] save text error:", err)
		return
	}

	// GORM sets item.ID on successful Create; ID==0 means duplicate — don't emit.
	if item.ID == 0 {
		return
	}

	emitNew(wailsCtx, item)
}

// checkImage reads the current image clipboard and saves if it changed.
func (m *Monitor) checkImage(wailsCtx context.Context) {
	data := goclip.Read(goclip.FmtImage)
	if len(data) == 0 {
		return
	}
	if len(data) > maxImageSize {
		return // skip oversized images
	}

	hash := hashBytes(data)
	if hash == m.lastImageHash {
		return
	}
	m.lastImageHash = hash

	filePath, err := m.saveImageFile(data)
	if err != nil {
		fmt.Println("[clipboard] save image file error:", err)
		return
	}

	item := &storage.ClipboardItem{
		Type:        "image",
		FilePath:    filePath,
		ContentHash: hash,
		SourceApp:   getSourceApp(),
		CreatedAt:   time.Now(),
	}

	if err := m.repo.Save(item); err != nil {
		fmt.Println("[clipboard] save image record error:", err)
		_ = os.Remove(filePath) // rollback orphan file
		return
	}

	// ID==0 means duplicate hash already in DB — remove the redundant file.
	if item.ID == 0 {
		_ = os.Remove(filePath)
		return
	}

	emitNew(wailsCtx, item)
}

// saveImageFile encodes RGBA/PNG bytes as PNG and writes to dataDir/items/{uuid}.png.
func (m *Monitor) saveImageFile(data []byte) (string, error) {
	itemsDir := filepath.Join(m.dataDir, "items")
	if err := os.MkdirAll(itemsDir, 0700); err != nil {
		return "", err
	}

	// golang.design/x/clipboard returns PNG-encoded data for FmtImage.
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("saveImageFile: invalid PNG data: %w", err)
	}

	filePath := filepath.Join(itemsDir, uuid.New().String()+".png")
	f, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return "", err
	}
	defer f.Close()

	return filePath, png.Encode(f, img)
}

// hashBytes returns a hex SHA-256 digest of data.
func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return fmt.Sprintf("%x", sum)
}

// emitNew fires the "clipboard:new" Wails runtime event with the saved item.
func emitNew(ctx context.Context, item *storage.ClipboardItem) {
	runtime.EventsEmit(ctx, "clipboard:new", item)
}
