package web

import (
	"log/slog"
	"net/http"
)

// renderPage executes a page template by name (e.g. "dashboard.html").
// The page template set must have been loaded at startup. Executes the
// "base" template which calls the page's {{define "content"}} block.
func (s *Server) renderPage(w http.ResponseWriter, name string, data any) {
	t, ok := s.pages[name]
	if !ok {
		slog.Error("page template not found", "name", name)
		http.Error(w, "template not found: "+name, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, "base", data); err != nil {
		slog.Error("render page", "name", name, "err", err)
	}
}

// renderPartial executes a standalone partial template by name.
func (s *Server) renderPartial(w http.ResponseWriter, name string, data any) {
	t, ok := s.partials[name]
	if !ok {
		slog.Error("partial template not found", "name", name)
		http.Error(w, "partial not found: "+name, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, name, data); err != nil {
		slog.Error("render partial", "name", name, "err", err)
	}
}
