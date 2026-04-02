package storage

import (
	"fmt"
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

// SearchFilter holds optional filters for advanced search.
type SearchFilter struct {
	Query    string `json:"query"`    // free-text (FTS5 MATCH on content + source_app)
	ItemType string `json:"itemType"` // "" = all, "text", "image"
	TimeRange string `json:"timeRange"` // "" = all, "1h", "24h", "7d", "30d"
}

// Search performs FTS5 full-text search with optional type and time filters.
// The query matches against both content and source_app fields.
func (r *Repository) Search(filter SearchFilter, limit int) ([]ClipboardItem, error) {
	var items []ClipboardItem
	var conditions []string
	var args []any

	// Build the base query — use FTS5 MATCH if query is non-empty
	useFTS := strings.TrimSpace(filter.Query) != ""

	if useFTS {
		// FTS5 MATCH searches both content and source_app columns
		conditions = append(conditions, "clipboard_fts MATCH ?")
		args = append(args, sanitizeFTSQuery(filter.Query))
	}

	// Type filter
	if filter.ItemType == "text" || filter.ItemType == "image" {
		conditions = append(conditions, "ci.type = ?")
		args = append(args, filter.ItemType)
	}

	// Time range filter
	if cutoff, ok := timeRangeCutoff(filter.TimeRange); ok {
		conditions = append(conditions, "ci.created_at >= ?")
		args = append(args, cutoff)
	}

	// Build final SQL
	var whereClause string
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	var query string
	if useFTS {
		query = fmt.Sprintf(`
			SELECT ci.* FROM clipboard_items ci
			JOIN clipboard_fts fts ON fts.rowid = ci.id
			%s
			ORDER BY ci.is_pinned DESC, ci.created_at DESC
			LIMIT ?`, whereClause)
	} else {
		query = fmt.Sprintf(`
			SELECT ci.* FROM clipboard_items ci
			%s
			ORDER BY ci.is_pinned DESC, ci.created_at DESC
			LIMIT ?`, whereClause)
	}
	args = append(args, limit)

	err := r.db.Raw(query, args...).Scan(&items).Error
	return items, err
}

// timeRangeCutoff converts a time range string to a cutoff time.
func timeRangeCutoff(tr string) (time.Time, bool) {
	now := time.Now()
	switch tr {
	case "1h":
		return now.Add(-1 * time.Hour), true
	case "24h":
		return now.Add(-24 * time.Hour), true
	case "7d":
		return now.AddDate(0, 0, -7), true
	case "30d":
		return now.AddDate(0, 0, -30), true
	default:
		return time.Time{}, false
	}
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
