package web

import (
	"log/slog"
	"net/http"
	"path/filepath"

	"github.com/dunamismax/gitpulse/internal/config"
)

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	view, err := s.rt.DashboardView(r.Context())
	if err != nil {
		slog.Error("dashboard view", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPage(w, "dashboard.html", map[string]any{
		"ActiveNav": "dashboard",
		"View":      view,
	})
}

func (s *Server) handleRepositoriesList(w http.ResponseWriter, r *http.Request) {
	cards, err := s.rt.RepositoryCards(r.Context())
	if err != nil {
		slog.Error("repo cards", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPage(w, "repositories.html", map[string]any{
		"ActiveNav": "repositories",
		"Cards":     cards,
	})
}

func (s *Server) handleRepoDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	view, err := s.rt.RepoDetail(r.Context(), id)
	if err != nil {
		slog.Error("repo detail", "id", id, "err", err)
		http.Error(w, "repository not found", http.StatusNotFound)
		return
	}
	s.renderPage(w, "repo_detail.html", map[string]any{
		"ActiveNav": "repositories",
		"View":      view,
	})
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	summary, err := s.rt.SessionsSummary(r.Context())
	if err != nil {
		slog.Error("sessions summary", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPage(w, "sessions.html", map[string]any{
		"ActiveNav": "sessions",
		"Summary":   summary,
	})
}

func (s *Server) handleAchievements(w http.ResponseWriter, r *http.Request) {
	achs, streaks, score, err := s.rt.AchievementsView(r.Context())
	if err != nil {
		slog.Error("achievements view", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	s.renderPage(w, "achievements.html", map[string]any{
		"ActiveNav":    "achievements",
		"Achievements": achs,
		"Streaks":      streaks,
		"TodayScore":   score,
	})
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	paths, _ := config.DiscoverPaths()
	if paths == nil {
		paths = &config.AppPaths{}
	}
	if resolved, err := config.ResolveConfigFile(s.configFile); err == nil {
		paths.ConfigFile = resolved
		paths.ConfigDir = filepath.Dir(resolved)
	}

	s.renderPage(w, "settings.html", map[string]any{
		"ActiveNav": "settings",
		"Config":    s.rt.Config(),
		"Paths":     paths,
		"Saved":     r.URL.Query().Get("saved") == "1",
	})
}
