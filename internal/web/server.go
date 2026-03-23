// Package web provides the HTTP server and all route handlers.
package web

import (
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/dunamismax/gitpulse/internal/runtime"
)

// Server holds the router, optional legacy templates, and runtime dependency.
type Server struct {
	mux         *http.ServeMux
	pages       map[string]*template.Template // legacy page name -> template set
	partials    map[string]*template.Template // legacy partial name -> standalone template
	rt          *runtime.Runtime
	configFile  string
	frontendDir string // path to Astro build output (frontend/dist)
}

// New creates a Server and loads the legacy templates only when the Astro
// frontend build output is not present.
func New(rt *runtime.Runtime, templatesDir, assetsDir, configFile, frontendDir string) (*Server, error) {
	s := &Server{
		mux:         http.NewServeMux(),
		pages:       make(map[string]*template.Template),
		partials:    make(map[string]*template.Template),
		rt:          rt,
		configFile:  configFile,
		frontendDir: frontendDir,
	}

	if !s.hasFrontend() {
		if err := s.loadTemplates(templatesDir); err != nil {
			return nil, fmt.Errorf("load templates: %w", err)
		}
	}

	s.registerRoutes(assetsDir)
	return s, nil
}

// hasFrontend reports whether the built Astro frontend exists.
func (s *Server) hasFrontend() bool {
	if s.frontendDir == "" {
		return false
	}
	info, err := os.Stat(filepath.Join(s.frontendDir, "index.html"))
	return err == nil && !info.IsDir()
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

	// JSON API routes are always available so the Astro frontend and any local
	// tooling share the same narrow backend boundary.
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
	mux.HandleFunc("POST /api/settings", s.handleAPISettingsSave)

	if s.hasFrontend() {
		slog.Info("serving Astro frontend", "dir", s.frontendDir)
		s.registerFrontendRoutes()
		return
	}

	slog.Info("serving legacy Go template frontend", "assets", assetsDir)
	s.registerLegacyRoutes(assetsDir)
}

func (s *Server) registerFrontendRoutes() {
	mux := s.mux
	fs := http.FileServer(http.Dir(s.frontendDir))

	mux.Handle("GET /_astro/", fs)

	servePage := func(filePath string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			http.ServeFile(w, r, filepath.Join(s.frontendDir, filePath))
		}
	}

	mux.HandleFunc("GET /{$}", servePage("index.html"))
	mux.HandleFunc("GET /repositories", servePage(filepath.Join("repositories", "index.html")))
	mux.HandleFunc("GET /repositories/{id}", servePage(filepath.Join("repositories", "detail", "index.html")))
	mux.HandleFunc("GET /sessions", servePage(filepath.Join("sessions", "index.html")))
	mux.HandleFunc("GET /achievements", servePage(filepath.Join("achievements", "index.html")))
	mux.HandleFunc("GET /settings", servePage(filepath.Join("settings", "index.html")))

	// Keep legacy form posts working as a thin compatibility layer.
	mux.HandleFunc("POST /repositories/add", s.handleRepoAdd)
	mux.HandleFunc("POST /repositories/{id}/refresh", s.handleRepoRefresh)
	mux.HandleFunc("POST /repositories/{id}/toggle", s.handleRepoToggle)
	mux.HandleFunc("POST /repositories/{id}/remove", s.handleRepoRemove)
	mux.HandleFunc("POST /repositories/{id}/patterns", s.handleRepoPatterns)
	mux.HandleFunc("POST /settings", s.handleSettingsSave)
}

func (s *Server) registerLegacyRoutes(assetsDir string) {
	mux := s.mux

	fs := http.FileServer(http.Dir(assetsDir))
	mux.Handle("GET /assets/", http.StripPrefix("/assets/", fs))

	mux.HandleFunc("GET /{$}", s.handleDashboard)
	mux.HandleFunc("GET /repositories", s.handleRepositoriesList)
	mux.HandleFunc("GET /repositories/{id}", s.handleRepoDetail)
	mux.HandleFunc("GET /sessions", s.handleSessions)
	mux.HandleFunc("GET /achievements", s.handleAchievements)
	mux.HandleFunc("GET /settings", s.handleSettings)

	mux.HandleFunc("GET /partials/dashboard-summary", s.handlePartialDashboardSummary)
	mux.HandleFunc("GET /partials/activity-feed", s.handlePartialActivityFeed)
	mux.HandleFunc("GET /partials/repo-cards", s.handlePartialRepoCards)

	mux.HandleFunc("POST /repositories/add", s.handleRepoAdd)
	mux.HandleFunc("POST /repositories/{id}/refresh", s.handleRepoRefresh)
	mux.HandleFunc("POST /repositories/{id}/toggle", s.handleRepoToggle)
	mux.HandleFunc("POST /repositories/{id}/remove", s.handleRepoRemove)
	mux.HandleFunc("POST /repositories/{id}/patterns", s.handleRepoPatterns)
	mux.HandleFunc("POST /settings", s.handleSettingsSave)
}
