package storage

import "time"

// ClipboardItem is the GORM model for a clipboard history entry.
// Type is either "text" or "image".
// FilePath stores the relative path to image files on disk.
// ContentHash ensures deduplication via a unique index.
type ClipboardItem struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Type        string    `gorm:"not null" json:"type"`
	Content     string    `json:"content"`
	FilePath    string    `json:"filePath"`
	ContentHash string    `gorm:"uniqueIndex;not null" json:"contentHash"`
	SourceApp   string    `json:"sourceApp"`
	IsPinned    bool      `gorm:"default:false" json:"isPinned"`
	CreatedAt   time.Time `json:"createdAt"`
}
