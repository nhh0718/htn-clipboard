package clipboard

import (
	"bytes"
	"context"
	"crypto/sha256"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
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
}

// NewMonitor creates a Monitor. Call Start to begin watching.
func NewMonitor(repo *storage.Repository, dataDir string) *Monitor {
	return &Monitor{repo: repo, dataDir: dataDir}
}

// Start launches the clipboard polling goroutine.
// wailsCtx is used for runtime event emission; it must be the context
// provided by Wails in app.startup.
func (m *Monitor) Start(wailsCtx context.Context) {
	if err := goclip.Init(); err != nil {
		// clipboard unavailable — log and return gracefully
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
			m.checkText(wailsCtx)
			m.checkImage(wailsCtx)
		}
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

	item := &storage.ClipboardItem{
		Type:        "text",
		Content:     string(data),
		ContentHash: hash,
		CreatedAt:   time.Now(),
	}

	if err := m.repo.Save(item); err != nil {
		fmt.Println("[clipboard] save text error:", err)
		return
	}

	m.lastTextHash = hash
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

	filePath, err := m.saveImageFile(data)
	if err != nil {
		fmt.Println("[clipboard] save image file error:", err)
		return
	}

	item := &storage.ClipboardItem{
		Type:        "image",
		FilePath:    filePath,
		ContentHash: hash,
		CreatedAt:   time.Now(),
	}

	if err := m.repo.Save(item); err != nil {
		fmt.Println("[clipboard] save image record error:", err)
		_ = os.Remove(filePath) // rollback orphan file
		return
	}

	m.lastImageHash = hash
	emitNew(wailsCtx, item)
}

// saveImageFile encodes raw RGBA bytes as PNG and writes to dataDir/items/{uuid}.png.
// Returns an error if the data cannot be decoded as a valid PNG image.
func (m *Monitor) saveImageFile(data []byte) (string, error) {
	itemsDir := filepath.Join(m.dataDir, "items")
	if err := os.MkdirAll(itemsDir, 0700); err != nil {
		return "", err
	}

	// data from golang.design/x/clipboard is NRGBA pixel data; must be valid PNG
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
