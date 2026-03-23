// Package web provides the HTTP server and all route handlers.
package web

import (
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"path/filepath"

	"github.com/dunamismax/gitpulse/internal/runtime"
)

// Server holds the router, per-page template sets, and runtime dependency.
type Server struct {
	mux        *http.ServeMux
	pages      map[string]*template.Template // page name -> template set
	partials   map[string]*template.Template // partial name -> standalone template
	rt         *runtime.Runtime
	configFile string
}

// New creates a Server, parses all templates, and registers routes.
func New(rt *runtime.Runtime, templatesDir, assetsDir, configFile string) (*Server, error) {
	s := &Server{
		mux:        http.NewServeMux(),
		pages:      make(map[string]*template.Template),
		partials:   make(map[string]*template.Template),
		rt:         rt,
		configFile: configFile,
	}

	if err := s.loadTemplates(templatesDir); err != nil {
		return nil, fmt.Errorf("load templates: %w", err)
	}

	s.registerRoutes(assetsDir)
	return s, nil
}

// loadTemplates parses all templates from the templates directory.
// For each page template, a separate template.Template is created containing
// base.html + the page file + all partials, so each page's {{define "content"}}
// overrides base's {{block "content"}} without conflicting with other pages.
func (s *Server) loadTemplates(dir string) error {
	baseFile := filepath.Join(dir, "base.html")
	partialFiles, err := filepath.Glob(filepath.Join(dir, "partials", "*.html"))
	if err != nil {
		return err
	}
	pageFiles, err := filepath.Glob(filepath.Join(dir, "pages", "*.html"))
	if err != nil {
		return err
	}

	funcs := templateFuncs()

	// Build a template set per page: base + partials + the specific page.
	for _, pageFile := range pageFiles {
		name := filepath.Base(pageFile)
		files := []string{baseFile, pageFile}
		files = append(files, partialFiles...)

		t, err := template.New("").Funcs(funcs).ParseFiles(files...)
		if err != nil {
			return fmt.Errorf("parse page template %s: %w", name, err)
		}
		s.pages[name] = t
	}

	// Build standalone templates for partials.
	for _, partialFile := range partialFiles {
		name := filepath.Base(partialFile)
		t, err := template.New(name).Funcs(funcs).ParseFiles(partialFile)
		if err != nil {
			return fmt.Errorf("parse partial template %s: %w", name, err)
		}
		s.partials[name] = t
	}

	slog.Info("templates loaded", "pages", len(s.pages), "partials", len(s.partials))
	return nil
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
func (s *Server) registerRoutes(assetsDir string) {
	mux := s.mux

	// Static assets.
	fs := http.FileServer(http.Dir(assetsDir))
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", fs))

	// Pages.
	mux.HandleFunc("GET /{$}", s.handleDashboard)
	mux.HandleFunc("GET /repositories", s.handleRepositoriesList)
	mux.HandleFunc("GET /repositories/{id}", s.handleRepoDetail)
	mux.HandleFunc("GET /sessions", s.handleSessions)
	mux.HandleFunc("GET /achievements", s.handleAchievements)
	mux.HandleFunc("GET /settings", s.handleSettings)

	// Partials (HTMX targets).
	mux.HandleFunc("GET /partials/dashboard-summary", s.handlePartialDashboardSummary)
	mux.HandleFunc("GET /partials/activity-feed", s.handlePartialActivityFeed)
	mux.HandleFunc("GET /partials/repo-cards", s.handlePartialRepoCards)

	// Actions.
	mux.HandleFunc("POST /repositories/add", s.handleRepoAdd)
	mux.HandleFunc("POST /repositories/{id}/refresh", s.handleRepoRefresh)
	mux.HandleFunc("POST /repositories/{id}/toggle", s.handleRepoToggle)
	mux.HandleFunc("POST /repositories/{id}/remove", s.handleRepoRemove)
	mux.HandleFunc("POST /repositories/{id}/patterns", s.handleRepoPatterns)
	mux.HandleFunc("POST /settings", s.handleSettingsSave)
}
