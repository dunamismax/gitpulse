// Package web provides the HTTP server and all route handlers.
package web

import (
	"log/slog"
	"net/http"

	"github.com/dunamismax/gitpulse/internal/runtime"
)

// Server holds the router and runtime dependency.
type Server struct {
	mux        *http.ServeMux
	rt         *runtime.Runtime
	configFile string
	uiHandler  http.Handler
}

// New creates a Server that serves the Go JSON API and forwards browser
// requests to the active operator UI handler.
func New(rt *runtime.Runtime, configFile string, uiHandler http.Handler) *Server {
	if uiHandler == nil {
		uiHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "GitPulse operator UI is not available", http.StatusServiceUnavailable)
		})
	}

	s := &Server{
		mux:        http.NewServeMux(),
		rt:         rt,
		configFile: configFile,
		uiHandler:  uiHandler,
	}
	s.registerRoutes()
	return s
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

	mux.Handle("/", s.uiHandler)
}
