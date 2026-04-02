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

	if err := migrateFTS5(db); err != nil {
		return nil, err
	}

	return db, nil
}

// migrateFTS5 drops the old single-column FTS table (if schema mismatch)
// and recreates with both content + source_app columns, then rebuilds.
func migrateFTS5(db *gorm.DB) error {
	// Check if existing FTS table has source_app column.
	// sqlite_master stores the CREATE statement — if it doesn't mention
	// source_app we need to recreate.
	var sql string
	db.Raw(`SELECT sql FROM sqlite_master WHERE name = 'clipboard_fts' AND type = 'table'`).Scan(&sql)

	needsRecreate := sql != "" && !containsSourceApp(sql)

	if needsRecreate {
		// Drop old triggers + table so we can recreate with new schema.
		drops := []string{
			`DROP TRIGGER IF EXISTS clipboard_fts_insert`,
			`DROP TRIGGER IF EXISTS clipboard_fts_delete`,
			`DROP TRIGGER IF EXISTS clipboard_fts_update`,
			`DROP TABLE IF EXISTS clipboard_fts`,
		}
		for _, stmt := range drops {
			if err := db.Exec(stmt).Error; err != nil {
				return err
			}
		}
	}

	return createFTS5(db)
}

// containsSourceApp is a simple substring check.
func containsSourceApp(sql string) bool {
	for i := 0; i+10 <= len(sql); i++ {
		if sql[i:i+10] == "source_app" {
			return true
		}
	}
	return false
}

// createFTS5 creates the FTS5 virtual table indexing both content and source_app,
// with INSERT/DELETE/UPDATE triggers to keep it in sync with clipboard_items.
func createFTS5(db *gorm.DB) error {
	stmts := []string{
		// FTS5 content table indexing content + source_app
		`CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
			content,
			source_app,
			content='clipboard_items',
			content_rowid='id'
		)`,
		// Populate FTS on INSERT
		`CREATE TRIGGER IF NOT EXISTS clipboard_fts_insert
			AFTER INSERT ON clipboard_items BEGIN
				INSERT INTO clipboard_fts(rowid, content, source_app)
				VALUES (new.id, new.content, new.source_app);
			END`,
		// Remove from FTS on DELETE
		`CREATE TRIGGER IF NOT EXISTS clipboard_fts_delete
			AFTER DELETE ON clipboard_items BEGIN
				INSERT INTO clipboard_fts(clipboard_fts, rowid, content, source_app)
				VALUES ('delete', old.id, old.content, old.source_app);
			END`,
		// Keep FTS in sync on UPDATE (delete old, insert new)
		`CREATE TRIGGER IF NOT EXISTS clipboard_fts_update
			AFTER UPDATE ON clipboard_items BEGIN
				INSERT INTO clipboard_fts(clipboard_fts, rowid, content, source_app)
				VALUES ('delete', old.id, old.content, old.source_app);
				INSERT INTO clipboard_fts(rowid, content, source_app)
				VALUES (new.id, new.content, new.source_app);
			END`,
		// Rebuild the FTS index to backfill existing rows
		`INSERT OR IGNORE INTO clipboard_fts(clipboard_fts) VALUES ('rebuild')`,
	}

	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			return err
		}
	}
	return nil
}
