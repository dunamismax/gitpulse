package web

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/config"
	"github.com/dunamismax/gitpulse/internal/db"
)

// writeJSON writes a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("write json", "err", err)
	}
}

// writeError writes a JSON error response.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// --- GET endpoints ---

func (s *Server) handleAPIDashboard(w http.ResponseWriter, r *http.Request) {
	view, err := s.rt.DashboardView(r.Context())
	if err != nil {
		slog.Error("api dashboard", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleAPIRepositories(w http.ResponseWriter, r *http.Request) {
	cards, err := s.rt.RepositoryCards(r.Context())
	if err != nil {
		slog.Error("api repositories", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, cards)
}

func (s *Server) handleAPIRepoDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	view, err := s.rt.RepoDetail(r.Context(), id)
	if err != nil {
		slog.Error("api repo detail", "id", id, "err", err)
		writeError(w, http.StatusNotFound, "repository not found")
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleAPISessions(w http.ResponseWriter, r *http.Request) {
	summary, err := s.rt.SessionsSummary(r.Context())
	if err != nil {
		slog.Error("api sessions", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

func (s *Server) handleAPIAchievements(w http.ResponseWriter, r *http.Request) {
	achs, streaks, score, err := s.rt.AchievementsView(r.Context())
	if err != nil {
		slog.Error("api achievements", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"achievements": achs,
		"streaks":      streaks,
		"today_score":  score,
	})
}

func (s *Server) handleAPISettings(w http.ResponseWriter, r *http.Request) {
	paths, _ := config.DiscoverPaths()
	if paths == nil {
		paths = &config.AppPaths{}
	}
	if resolved, err := config.ResolveConfigFile(s.configFile); err == nil {
		paths.ConfigFile = resolved
		paths.ConfigDir = filepath.Dir(resolved)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"config": s.rt.Config(),
		"paths":  paths,
	})
}

// --- POST endpoints ---

func (s *Server) handleAPIRepoAdd(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	path := strings.TrimSpace(body.Path)
	if path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}

	repos, err := s.rt.AddTarget(r.Context(), path)
	if err != nil {
		slog.Error("api add target", "path", path, "err", err)
		writeError(w, http.StatusInternalServerError, "failed to add repository: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "repos": repos})
}

func (s *Server) handleAPIRepoRefresh(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.rt.RefreshRepository(r.Context(), id, true); err != nil {
		slog.Error("api refresh repo", "id", id, "err", err)
		writeError(w, http.StatusInternalServerError, "refresh failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAPIRepoToggle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.rt.ToggleRepository(r.Context(), id); err != nil {
		slog.Error("api toggle repo", "id", id, "err", err)
		writeError(w, http.StatusInternalServerError, "toggle failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAPIRepoRemove(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.rt.RemoveRepository(r.Context(), id); err != nil {
		slog.Error("api remove repo", "id", id, "err", err)
		writeError(w, http.StatusInternalServerError, "remove failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAPIRepoPatterns(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var body struct {
		Include []string `json:"include_patterns"`
		Exclude []string `json:"exclude_patterns"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if err := db.SetRepositoryPatterns(r.Context(), s.rt.DB(), id, body.Include, body.Exclude); err != nil {
		slog.Error("api set patterns", "id", id, "err", err)
		writeError(w, http.StatusInternalServerError, "save failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAPISettingsSave(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Authors            []string `json:"authors"`
		ChangedLinesPerDay int      `json:"changed_lines_per_day"`
		CommitsPerDay      int      `json:"commits_per_day"`
		FocusMinutesPerDay int      `json:"focus_minutes_per_day"`
		Timezone           string   `json:"timezone"`
		DayBoundaryMinutes int      `json:"day_boundary_minutes"`
		SessionGapMinutes  int      `json:"session_gap_minutes"`
		ImportDays         int      `json:"import_days"`
		IncludePatterns    []string `json:"include_patterns"`
		ExcludePatterns    []string `json:"exclude_patterns"`
		GithubEnabled      bool     `json:"github_enabled"`
		VerifyRemotePushes bool     `json:"github_verify_remote_pushes"`
		GithubToken        string   `json:"github_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	current := s.rt.Config()
	next := current.Clone()

	if body.Timezone == "" {
		body.Timezone = "UTC"
	}
	if body.SessionGapMinutes < 1 {
		writeError(w, http.StatusBadRequest, "session gap minutes must be at least 1")
		return
	}
	if body.ImportDays < 1 {
		writeError(w, http.StatusBadRequest, "import days must be at least 1")
		return
	}

	next.Authors = mergeAuthorEmails(current.Authors, body.Authors)
	next.Goals.ChangedLinesPerDay = body.ChangedLinesPerDay
	next.Goals.CommitsPerDay = body.CommitsPerDay
	next.Goals.FocusMinutesPerDay = body.FocusMinutesPerDay
	next.UI.Timezone = body.Timezone
	next.UI.DayBoundaryMinutes = body.DayBoundaryMinutes
	next.Monitoring.SessionGapMinutes = int64(body.SessionGapMinutes)
	next.Monitoring.ImportDays = body.ImportDays
	next.Patterns.Include = body.IncludePatterns
	next.Patterns.Exclude = body.ExcludePatterns
	next.Github.Enabled = body.GithubEnabled
	next.Github.VerifyRemotePushes = body.VerifyRemotePushes

	if token := strings.TrimSpace(body.GithubToken); token != "" {
		next.Github.Token = &token
	}

	savedPath, err := config.Save(s.configFile, next)
	if err != nil {
		slog.Error("api save settings", "config_file", s.configFile, "err", err)
		writeError(w, http.StatusInternalServerError, "save failed")
		return
	}

	s.configFile = savedPath
	s.rt.SetConfig(next)
	slog.Info("settings saved via api", "config_file", savedPath)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
