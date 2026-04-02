package storage

import (
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// InitDB opens (or creates) the SQLite database at dataDir/clipboard.db.
// Enables WAL mode and foreign keys, runs AutoMigrate, and sets up
// the FTS5 virtual table plus sync triggers.
func InitDB(dataDir string) (*gorm.DB, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, err
	}

	dsn := "file:" + filepath.Join(dataDir, "clipboard.db") +
		"?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000"

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(&ClipboardItem{}); err != nil {
		return nil, err
	}

	if err := createFTS5(db); err != nil {
		return nil, err
	}

	return db, nil
}

// createFTS5 creates the FTS5 virtual table and INSERT/DELETE triggers
// that keep it in sync with clipboard_items.
func createFTS5(db *gorm.DB) error {
	stmts := []string{
		// FTS5 content table backed by clipboard_items
		`CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
			content,
			content='clipboard_items',
			content_rowid='id'
		)`,
		// Populate FTS on INSERT
		`CREATE TRIGGER IF NOT EXISTS clipboard_fts_insert
			AFTER INSERT ON clipboard_items BEGIN
				INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
			END`,
		// Remove from FTS on DELETE
		`CREATE TRIGGER IF NOT EXISTS clipboard_fts_delete
			AFTER DELETE ON clipboard_items BEGIN
				INSERT INTO clipboard_fts(clipboard_fts, rowid, content)
					VALUES ('delete', old.id, old.content);
			END`,
		// Keep FTS in sync on UPDATE (delete old, insert new)
		`CREATE TRIGGER IF NOT EXISTS clipboard_fts_update
			AFTER UPDATE ON clipboard_items BEGIN
				INSERT INTO clipboard_fts(clipboard_fts, rowid, content)
					VALUES ('delete', old.id, old.content);
				INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
			END`,
	}

	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}
