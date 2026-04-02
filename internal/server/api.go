package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"clipboard-pro/internal/config"
	"clipboard-pro/internal/storage"

	goclip "golang.design/x/clipboard"
)

// Server is the local HTTP API server bound to 127.0.0.1 only.
type Server struct {
	repo   *storage.Repository
	config *config.Config
	server *http.Server
}

// NewServer creates a Server with the given repository and config.
func NewServer(repo *storage.Repository, cfg *config.Config) *Server {
	s := &Server{repo: repo, config: cfg}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/ping", s.handlePing)
	mux.HandleFunc("/api/v1/history", s.authMiddleware(s.handleHistory))
	mux.HandleFunc("/api/v1/search", s.authMiddleware(s.handleSearch))
	mux.HandleFunc("/api/v1/paste", s.authMiddleware(s.handlePaste))
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
		if strings.HasPrefix(origin, "chrome-extension://") || strings.HasPrefix(origin, "moz-extension://") {
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

	// Push type='text' filter into SQL so offset-based pagination is correct.
	items, err := s.repo.GetAllText(limit, offset)
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
	if q == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "q is required"})
		return
	}
	limit := queryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}

	items, err := s.repo.Search(q, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if items == nil {
		items = []storage.ClipboardItem{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
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
	if item.Type == "text" {
		goclip.Write(goclip.FmtText, []byte(item.Content))
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
