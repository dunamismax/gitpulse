package web

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/db"
)

func (s *Server) handleRepoAdd(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", http.StatusBadRequest)
		return
	}
	path := strings.TrimSpace(r.FormValue("path"))
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	_, err := s.rt.AddTarget(r.Context(), path)
	if err != nil {
		slog.Error("add target", "path", path, "err", err)
		http.Error(w, "failed to add repository: "+err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/repositories", http.StatusSeeOther)
}

func (s *Server) handleRepoRefresh(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := s.rt.RefreshRepository(r.Context(), id, true); err != nil {
		slog.Error("refresh repo", "id", id, "err", err)
		http.Error(w, "refresh failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/repositories/"+id.String(), http.StatusSeeOther)
}

func (s *Server) handleRepoToggle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := s.rt.ToggleRepository(r.Context(), id); err != nil {
		slog.Error("toggle repo", "id", id, "err", err)
		http.Error(w, "toggle failed", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/repositories", http.StatusSeeOther)
}

func (s *Server) handleRepoRemove(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := s.rt.RemoveRepository(r.Context(), id); err != nil {
		slog.Error("remove repo", "id", id, "err", err)
		http.Error(w, "remove failed", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/repositories", http.StatusSeeOther)
}

func (s *Server) handleRepoPatterns(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", http.StatusBadRequest)
		return
	}

	include := splitLines(r.FormValue("include_patterns"))
	exclude := splitLines(r.FormValue("exclude_patterns"))

	if err := db.SetRepositoryPatterns(r.Context(), s.rt.Pool(), id, include, exclude); err != nil {
		slog.Error("set patterns", "id", id, "err", err)
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/repositories/"+id.String(), http.StatusSeeOther)
}

func (s *Server) handleSettingsSave(w http.ResponseWriter, r *http.Request) {
	// For now, settings save re-renders the settings page with success feedback.
	// Full settings persistence requires TOML file writing which is out of scope
	// for this handler; it can be added as a follow-up.
	slog.Info("settings save requested (not yet persisted)")
	http.Redirect(w, r, "/settings", http.StatusSeeOther)
}

// splitLines splits a newline-separated string into a trimmed, non-empty slice.
func splitLines(s string) []string {
	var out []string
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return out
}
