package server

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"clipboard-pro/internal/config"
	"clipboard-pro/internal/storage"

	goclip "golang.design/x/clipboard"
)

// OnDataChange is called when the HTTP API modifies data (pin/delete).
// The app sets this to emit Wails events so the desktop UI stays in sync.
type OnDataChange func(event string)

// Server is the local HTTP API server bound to 127.0.0.1 only.
type Server struct {
	repo       *storage.Repository
	config     *config.Config
	server     *http.Server
	OnChange   OnDataChange
}

// NewServer creates a Server with the given repository, config, and optional
// embedded frontend assets (the same embed.FS used by Wails).
// Pass nil for assets to skip serving the frontend.
func NewServer(repo *storage.Repository, cfg *config.Config, assets *embed.FS) *Server {
	s := &Server{repo: repo, config: cfg}
	mux := http.NewServeMux()

	// Serve embedded frontend at / — same React app as the Wails window.
	if assets != nil {
		distFS, err := fs.Sub(*assets, "frontend/dist")
		if err == nil {
			fileServer := http.FileServer(http.FS(distFS))
			mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				// Try to serve the file. If not found, serve index.html (SPA fallback).
				path := r.URL.Path
				if path == "/" {
					path = "/index.html"
				}
				// Check if file exists in embedded FS
				if f, err := distFS.Open(strings.TrimPrefix(path, "/")); err == nil {
					f.Close()
					fileServer.ServeHTTP(w, r)
					return
				}
				// SPA fallback — serve index.html for any unmatched route
				r.URL.Path = "/"
				fileServer.ServeHTTP(w, r)
			})
		}
	}

	mux.HandleFunc("/api/v1/ping", s.handlePing)
	mux.HandleFunc("/api/v1/history", s.authMiddleware(s.handleHistory))
	mux.HandleFunc("/api/v1/search", s.authMiddleware(s.handleSearch))
	mux.HandleFunc("/api/v1/paste", s.authMiddleware(s.handlePaste))
	mux.HandleFunc("/api/v1/delete", s.authMiddleware(s.handleDelete))
	mux.HandleFunc("/api/v1/pin", s.authMiddleware(s.handlePin))
	// Image files served without auth — localhost-only and no sensitive data
	mux.HandleFunc("/api/v1/image/", s.handleImage)
	s.server = &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", cfg.Port),
		Handler: s.corsMiddleware(mux),
	}
	return s
}

// Start launches the HTTP server in a background goroutine.
func (s *Server) Start() {
	go func() {
		fmt.Printf("[server] listening on %s\n", s.server.Addr)
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Println("[server] error:", err)
		}
	}()
}

// Stop gracefully shuts down the HTTP server.
func (s *Server) Stop(ctx context.Context) {
	if s.server != nil {
		if err := s.server.Shutdown(ctx); err != nil {
			fmt.Println("[server] shutdown error:", err)
		}
	}
}

// --- Middleware ---

// corsMiddleware adds CORS headers for browser extension origins.
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if strings.HasPrefix(origin, "chrome-extension://") || strings.HasPrefix(origin, "moz-extension://") ||
		strings.HasPrefix(origin, "http://127.0.0.1") || strings.HasPrefix(origin, "http://localhost") {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// authMiddleware enforces Bearer token authentication.
func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" || token != s.config.AuthToken {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// --- Handlers ---

func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": "1.0.0"})
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	limit := queryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}
	offset := queryInt(r, "offset", 0)

	// If type param is specified, filter by type. Otherwise return all types.
	typeFilter := r.URL.Query().Get("type")
	var items []storage.ClipboardItem
	var err error
	if typeFilter == "text" {
		items, err = s.repo.GetAllText(limit, offset)
	} else {
		items, err = s.repo.GetAll(limit, offset)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if items == nil {
		items = []storage.ClipboardItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	itemType := r.URL.Query().Get("type")
	timeRange := r.URL.Query().Get("time")
	// At least one filter must be specified
	if q == "" && itemType == "" && timeRange == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "q, type, or time is required"})
		return
	}
	limit := queryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}

	filter := storage.SearchFilter{
		Query:     q,
		ItemType:  itemType,
		TimeRange: timeRange,
	}
	items, err := s.repo.Search(filter, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if items == nil {
		items = []storage.ClipboardItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

// handleImage serves an image file by item ID.
// No auth required — endpoint is localhost-only and item IDs are not sensitive.
func (s *Server) handleImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Extract ID from URL: /api/v1/image/{id}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/v1/image/")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	item, err := s.repo.GetByID(uint(id))
	if err != nil || item.Type != "image" || item.FilePath == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Only serve files within the configured DataDir to prevent path traversal
	absPath := item.FilePath
	if !strings.HasPrefix(filepath.ToSlash(absPath), filepath.ToSlash(s.config.DataDir)) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write(data)
}

func (s *Server) handlePaste(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var body struct {
		ID uint `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	item, err := s.repo.GetByID(body.ID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "item not found"})
		return
	}
	switch item.Type {
	case "text":
		goclip.Write(goclip.FmtText, []byte(item.Content))
	case "image":
		if item.FilePath != "" {
			data, err := os.ReadFile(item.FilePath)
			if err == nil {
				goclip.Write(goclip.FmtImage, data)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var body struct {
		ID uint `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if err := s.repo.Delete(body.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	s.notify("delete")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handlePin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var body struct {
		ID uint `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if err := s.repo.TogglePin(body.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	s.notify("pin")
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// notify fires the OnChange callback if set.
func (s *Server) notify(event string) {
	if s.OnChange != nil {
		s.OnChange(event)
	}
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func queryInt(r *http.Request, key string, defaultVal int) int {
	if raw := r.URL.Query().Get(key); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil {
			return v
		}
	}
	return defaultVal
}
