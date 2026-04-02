package storage

import (
	"os"
	"strings"
	"time"
	"unicode"

	"gorm.io/gorm"
)

// sanitizeFTSQuery sanitizes input for safe use in FTS5 MATCH expressions.
// Wraps the query in double-quotes so it is treated as a phrase, escaping
// any internal double-quotes. Caps length to 256 chars.
func sanitizeFTSQuery(q string) string {
	if len(q) > 256 {
		q = q[:256]
	}
	// Strip control characters
	q = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, q)
	// Escape internal double-quotes and wrap as phrase
	q = strings.ReplaceAll(q, `"`, `""`)
	return `"` + q + `"`
}

// Repository provides data access methods for ClipboardItem.
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a Repository wrapping the given gorm.DB.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Save inserts a ClipboardItem if its ContentHash is not already stored.
// Returns nil (no error) when a duplicate is detected — caller can ignore.
func (r *Repository) Save(item *ClipboardItem) error {
	var count int64
	r.db.Model(&ClipboardItem{}).
		Where("content_hash = ?", item.ContentHash).
		Count(&count)
	if count > 0 {
		return nil // duplicate, skip silently
	}
	return r.db.Create(item).Error
}

// GetAll returns items ordered by pinned first, then newest first.
func (r *Repository) GetAll(limit, offset int) ([]ClipboardItem, error) {
	var items []ClipboardItem
	err := r.db.
		Order("is_pinned DESC, created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error
	return items, err
}

// Search performs an FTS5 MATCH query and returns matching items.
// The query is sanitized to prevent FTS5 injection.
func (r *Repository) Search(query string, limit int) ([]ClipboardItem, error) {
	var items []ClipboardItem
	err := r.db.Raw(`
		SELECT ci.* FROM clipboard_items ci
		JOIN clipboard_fts fts ON fts.rowid = ci.id
		WHERE clipboard_fts MATCH ?
		ORDER BY ci.is_pinned DESC, ci.created_at DESC
		LIMIT ?`, sanitizeFTSQuery(query), limit).
		Scan(&items).Error
	return items, err
}

// GetAllText returns text-only items for the HTTP API, ordered by pinned first then newest.
// The WHERE clause is pushed to SQL so offset-based pagination works correctly.
func (r *Repository) GetAllText(limit, offset int) ([]ClipboardItem, error) {
	var items []ClipboardItem
	err := r.db.
		Where("type = ?", "text").
		Order("is_pinned DESC, created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error
	return items, err
}

// PruneToLimit deletes the oldest unpinned items exceeding maxItems.
func (r *Repository) PruneToLimit(maxItems int) error {
	var total int64
	if err := r.db.Model(&ClipboardItem{}).Count(&total).Error; err != nil {
		return err
	}
	if int(total) <= maxItems {
		return nil
	}
	excess := int(total) - maxItems
	// Fetch oldest unpinned items to prune (images need file cleanup)
	var old []ClipboardItem
	if err := r.db.
		Where("is_pinned = ?", false).
		Order("created_at ASC").
		Limit(excess).
		Find(&old).Error; err != nil {
		return err
	}
	for _, item := range old {
		if item.Type == "image" && item.FilePath != "" {
			_ = os.Remove(item.FilePath)
		}
	}
	ids := make([]uint, len(old))
	for i, item := range old {
		ids[i] = item.ID
	}
	if len(ids) == 0 {
		return nil
	}
	return r.db.Delete(&ClipboardItem{}, ids).Error
}

// Delete removes an item by ID and deletes its image file if type=image.
func (r *Repository) Delete(id uint) error {
	var item ClipboardItem
	if err := r.db.First(&item, id).Error; err != nil {
		return err
	}
	if item.Type == "image" && item.FilePath != "" {
		_ = os.Remove(item.FilePath) // best-effort, ignore error
	}
	return r.db.Delete(&ClipboardItem{}, id).Error
}

// TogglePin flips the IsPinned flag on the given item.
func (r *Repository) TogglePin(id uint) error {
	return r.db.Model(&ClipboardItem{}).
		Where("id = ?", id).
		Update("is_pinned", gorm.Expr("NOT is_pinned")).Error
}

// DeleteOlderThan removes unpinned items older than the given number of days.
// Also removes associated image files from disk.
func (r *Repository) DeleteOlderThan(days int) error {
	cutoff := time.Now().AddDate(0, 0, -days)

	var old []ClipboardItem
	if err := r.db.
		Where("created_at < ? AND is_pinned = ?", cutoff, false).
		Find(&old).Error; err != nil {
		return err
	}

	for _, item := range old {
		if item.Type == "image" && item.FilePath != "" {
			_ = os.Remove(item.FilePath)
		}
	}

	return r.db.
		Where("created_at < ? AND is_pinned = ?", cutoff, false).
		Delete(&ClipboardItem{}).Error
}

// Count returns the total number of stored clipboard items.
func (r *Repository) Count() (int64, error) {
	var count int64
	err := r.db.Model(&ClipboardItem{}).Count(&count).Error
	return count, err
}

// GetByID retrieves a single item by its primary key.
func (r *Repository) GetByID(id uint) (*ClipboardItem, error) {
	var item ClipboardItem
	err := r.db.First(&item, id).Error
	return &item, err
}

// GetByHash retrieves an item by its SHA-256 content hash (for dedup checks).
func (r *Repository) GetByHash(hash string) (*ClipboardItem, error) {
	var item ClipboardItem
	err := r.db.Where("content_hash = ?", hash).First(&item).Error
	return &item, err
}
