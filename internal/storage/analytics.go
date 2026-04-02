package storage

import "gorm.io/gorm"

// AnalyticsData holds all aggregate statistics for the dashboard.
type AnalyticsData struct {
	TotalItems       int64            `json:"totalItems"`
	TotalText        int64            `json:"totalText"`
	TotalImages      int64            `json:"totalImages"`
	TotalPinned      int64            `json:"totalPinned"`
	TodayCount       int64            `json:"todayCount"`
	WeekCount        int64            `json:"weekCount"`
	DailyCounts      []DailyCount     `json:"dailyCounts"`
	HourlyCounts     []HourlyCount    `json:"hourlyCounts"`
	TopSourceApps    []SourceAppCount `json:"topSourceApps"`
	TypeDistribution []TypeCount      `json:"typeDistribution"`
}

// DailyCount represents clipboard activity for a single day.
type DailyCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// HourlyCount represents clipboard activity for an hour of the day (0-23).
type HourlyCount struct {
	Hour  int   `json:"hour"`
	Count int64 `json:"count"`
}

// SourceAppCount represents clipboard usage from a specific application.
type SourceAppCount struct {
	App   string `json:"app"`
	Count int64  `json:"count"`
}

// TypeCount represents clipboard item count by type (text/image).
type TypeCount struct {
	Type  string `json:"type"`
	Count int64  `json:"count"`
}

// GetAnalytics runs all aggregate queries and returns a complete analytics snapshot.
func (r *Repository) GetAnalytics() AnalyticsData {
	data := AnalyticsData{
		DailyCounts:      []DailyCount{},
		HourlyCounts:     []HourlyCount{},
		TopSourceApps:    []SourceAppCount{},
		TypeDistribution: []TypeCount{},
	}

	// Summary counts
	r.db.Model(&ClipboardItem{}).Count(&data.TotalItems)
	r.db.Model(&ClipboardItem{}).Where("type = ?", "text").Count(&data.TotalText)
	r.db.Model(&ClipboardItem{}).Where("type = ?", "image").Count(&data.TotalImages)
	r.db.Model(&ClipboardItem{}).Where("is_pinned = ?", true).Count(&data.TotalPinned)
	r.db.Model(&ClipboardItem{}).Where("created_at >= datetime('now', '-1 day')").Count(&data.TodayCount)
	r.db.Model(&ClipboardItem{}).Where("created_at >= datetime('now', '-7 days')").Count(&data.WeekCount)

	// Daily counts — last 30 days
	r.db.Raw(`
		SELECT date(created_at) AS date, COUNT(*) AS count
		FROM clipboard_items
		WHERE created_at >= datetime('now', '-30 days')
		GROUP BY date(created_at)
		ORDER BY date
	`).Scan(&data.DailyCounts)

	// Hourly distribution — all time
	r.db.Raw(`
		SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS count
		FROM clipboard_items
		GROUP BY hour
		ORDER BY hour
	`).Scan(&data.HourlyCounts)

	// Top 10 source apps
	r.db.Raw(`
		SELECT source_app AS app, COUNT(*) AS count
		FROM clipboard_items
		WHERE source_app != ''
		GROUP BY source_app
		ORDER BY count DESC
		LIMIT 10
	`).Scan(&data.TopSourceApps)

	// Type distribution
	r.db.Raw(`
		SELECT type, COUNT(*) AS count
		FROM clipboard_items
		GROUP BY type
	`).Scan(&data.TypeDistribution)

	return data
}

// analyticsRepo is used by the HTTP server to avoid tight coupling.
type AnalyticsRepo interface {
	GetAnalytics() AnalyticsData
}

// Verify Repository implements AnalyticsRepo at compile time.
var _ AnalyticsRepo = (*Repository)(nil)

// NewAnalyticsRepo returns the repository typed as AnalyticsRepo for the HTTP server.
func NewAnalyticsRepo(db *gorm.DB) AnalyticsRepo {
	return NewRepository(db)
}
