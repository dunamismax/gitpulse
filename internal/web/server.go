// Package web provides the HTTP server and all route handlers.
package web

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/dunamismax/gitpulse/internal/runtime"
)

// Server holds the router and runtime dependency.
type Server struct {
	mux        *http.ServeMux
	rt         *runtime.Runtime
	configFile string
	spaDir     string // path to SPA build output (web/dist)
}

// New creates a Server that serves the React SPA and JSON API.
func New(rt *runtime.Runtime, configFile, spaDir string) (*Server, error) {
	indexPath := filepath.Join(spaDir, "index.html")
	info, err := os.Stat(indexPath)
	if err != nil || info.IsDir() {
		return nil, fmt.Errorf("spa build not found at %s", indexPath)
	}

	s := &Server{
		mux:        http.NewServeMux(),
		rt:         rt,
		configFile: configFile,
		spaDir:     spaDir,
	}
	s.registerRoutes()
	return s, nil
}

// ServeHTTP implements http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe(addr string) error {
	slog.Info("web server listening", "addr", addr)
	return http.ListenAndServe(addr, s)
}

// registerRoutes wires all HTTP routes.
func (s *Server) registerRoutes() {
	mux := s.mux

	// JSON API
	mux.HandleFunc("GET /api/dashboard", s.handleAPIDashboard)
	mux.HandleFunc("GET /api/repositories", s.handleAPIRepositories)
	mux.HandleFunc("GET /api/repositories/{id}", s.handleAPIRepoDetail)
	mux.HandleFunc("GET /api/sessions", s.handleAPISessions)
	mux.HandleFunc("GET /api/achievements", s.handleAPIAchievements)
	mux.HandleFunc("GET /api/settings", s.handleAPISettings)

	mux.HandleFunc("POST /api/repositories/add", s.handleAPIRepoAdd)
	mux.HandleFunc("POST /api/repositories/{id}/refresh", s.handleAPIRepoRefresh)
	mux.HandleFunc("POST /api/repositories/{id}/toggle", s.handleAPIRepoToggle)
	mux.HandleFunc("POST /api/repositories/{id}/remove", s.handleAPIRepoRemove)
	mux.HandleFunc("POST /api/repositories/{id}/patterns", s.handleAPIRepoPatterns)
	mux.HandleFunc("POST /api/repositories/{id}/import", s.handleAPIRepoImport)
	mux.HandleFunc("POST /api/actions/import", s.handleAPIImportAll)
	mux.HandleFunc("POST /api/actions/rescan", s.handleAPIRescanAll)
	mux.HandleFunc("POST /api/actions/rebuild", s.handleAPIRebuildAnalytics)
	mux.HandleFunc("POST /api/settings", s.handleAPISettingsSave)

	// SPA static assets from the Vite build output.
	slog.Info("serving SPA", "dir", s.spaDir)
	fs := http.FileServer(http.Dir(s.spaDir))
	mux.Handle("GET /assets/", fs)

	// Catch-all: serve index.html for any non-API GET so the client-side
	// router handles the path. If the path maps to a real built file, serve it
	// directly.
	indexPath := filepath.Join(s.spaDir, "index.html")
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			fp := filepath.Join(s.spaDir, filepath.Clean(r.URL.Path))
			if info, err := os.Stat(fp); err == nil && !info.IsDir() {
				http.ServeFile(w, r, fp)
				return
			}
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeFile(w, r, indexPath)
	})
}
