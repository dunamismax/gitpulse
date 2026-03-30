package web

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/config"
	"github.com/dunamismax/gitpulse/internal/db"
	"github.com/dunamismax/gitpulse/internal/models"
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
	writeJSON(w, status, models.ErrorResponse{Error: msg})
}

func writeAction(w http.ResponseWriter, status int, payload models.ActionPayload) {
	writeJSON(w, status, models.ActionResponse{Data: payload})
}

// --- GET endpoints ---

func (s *Server) handleAPIDashboard(w http.ResponseWriter, r *http.Request) {
	view, err := s.rt.DashboardView(r.Context())
	if err != nil {
		slog.Error("api dashboard", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.DashboardResponse{Data: *view})
}

func (s *Server) handleAPIRepositories(w http.ResponseWriter, r *http.Request) {
	cards, err := s.rt.RepositoryCards(r.Context())
	if err != nil {
		slog.Error("api repositories", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.RepositoriesResponse{
		Data: models.RepositoriesPayload{
			Repositories: cards,
		},
	})
}

func (s *Server) handleAPIRepoDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	view, err := s.rt.RepoDetail(r.Context(), id)
	if err != nil {
		slog.Error("api repo detail", "id", id, "err", err)
		writeError(w, http.StatusNotFound, "repository not found")
		return
	}
	writeJSON(w, http.StatusOK, models.RepoDetailResponse{Data: *view})
}

func (s *Server) handleAPISessions(w http.ResponseWriter, r *http.Request) {
	summary, err := s.rt.SessionsSummary(r.Context())
	if err != nil {
		slog.Error("api sessions", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.SessionsResponse{Data: *summary})
}

func (s *Server) handleAPIAchievements(w http.ResponseWriter, r *http.Request) {
	view, err := s.rt.AchievementsView(r.Context())
	if err != nil {
		slog.Error("api achievements", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.AchievementsResponse{Data: *view})
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

	writeJSON(w, http.StatusOK, models.SettingsResponse{
		Data: models.SettingsView{
			Config: *s.rt.Config(),
			Paths:  *paths,
		},
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
	result := models.OperatorActionResult{
		Action:  "add_target",
		Title:   "Target registration finished",
		Summary: fmt.Sprintf("Registered %d repositor%s from %s.", len(repos), pluralizeRepository(len(repos)), path),
		Lines: []string{
			fmt.Sprintf("Repositories registered: %d", len(repos)),
			fmt.Sprintf("Root path: %s", path),
			"Import, rescan, and rebuild remain explicit follow-up steps.",
		},
	}
	writeAction(w, http.StatusOK, models.ActionPayload{
		Result:       result,
		Repositories: repos,
	})
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
	detail, _ := s.rt.RepoDetail(r.Context(), id.String())
	result := models.OperatorActionResult{
		Action:  "refresh_repo",
		Title:   "Repository refresh finished",
		Summary: fmt.Sprintf("Refreshed live git state for %s.", id),
		Lines: []string{
			"Live working-tree state refreshed from local git data.",
			"Import and rebuild remain explicit follow-up actions.",
		},
	}
	if detail != nil {
		result.Summary = fmt.Sprintf("Refreshed live git state for %s.", detail.Card.Repo.Name)
	}

	payload := models.ActionPayload{Result: result}
	if detail != nil {
		card := detail.Card
		payload.RepositoryCard = &card
	}
	writeAction(w, http.StatusOK, payload)
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
	repo, _ := db.GetRepository(r.Context(), s.rt.DB(), id)
	result := models.OperatorActionResult{
		Action:  "toggle_repo",
		Title:   "Repository monitoring updated",
		Summary: fmt.Sprintf("Updated monitoring state for repository %s.", id),
	}
	if repo != nil {
		result.Summary = fmt.Sprintf("Updated monitoring state for %s.", repo.Name)
		result.Lines = []string{
			fmt.Sprintf("State: %s", repo.State),
			fmt.Sprintf("Monitored: %t", repo.IsMonitored),
		}
	}
	writeAction(w, http.StatusOK, models.ActionPayload{
		Result:     result,
		Repository: repo,
	})
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
	repo, _ := db.GetRepository(r.Context(), s.rt.DB(), id)
	result := models.OperatorActionResult{
		Action:  "remove_repo",
		Title:   "Repository removed",
		Summary: fmt.Sprintf("Removed repository %s from the active operator set.", id),
	}
	if repo != nil {
		result.Summary = fmt.Sprintf("Removed %s from the active operator set.", repo.Name)
		result.Lines = []string{
			fmt.Sprintf("State: %s", repo.State),
			"History and snapshots remain in the local database until rebuilt or inspected.",
		}
	}
	writeAction(w, http.StatusOK, models.ActionPayload{
		Result:     result,
		Repository: repo,
	})
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
	repo, _ := db.GetRepository(r.Context(), s.rt.DB(), id)
	result := models.OperatorActionResult{
		Action:  "save_repo_patterns",
		Title:   "Repository patterns saved",
		Summary: fmt.Sprintf("Saved include and exclude patterns for repository %s.", id),
		Lines: []string{
			fmt.Sprintf("Include patterns: %d", len(body.Include)),
			fmt.Sprintf("Exclude patterns: %d", len(body.Exclude)),
		},
	}
	if repo != nil {
		result.Summary = fmt.Sprintf("Saved include and exclude patterns for %s.", repo.Name)
	}
	writeAction(w, http.StatusOK, models.ActionPayload{
		Result:     result,
		Repository: repo,
	})
}

func (s *Server) handleAPIRepoImport(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	days, ok := decodeImportDays(r, s.rt.Config().Monitoring.ImportDays)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	repo, err := db.GetRepository(r.Context(), s.rt.DB(), id)
	if err != nil || repo == nil {
		slog.Error("api import repo resolve", "id", id, "err", err)
		writeError(w, http.StatusNotFound, "repository not found")
		return
	}

	start := time.Now()
	imported, err := s.rt.ImportRepoHistory(r.Context(), id, days)
	if err != nil {
		slog.Error("api import repo", "id", id, "days", days, "err", err)
		writeError(w, http.StatusInternalServerError, "import failed: "+err.Error())
		return
	}

	writeAction(w, http.StatusOK, models.ActionPayload{
		Result: models.OperatorActionResult{
			Action:  "import_repo",
			Title:   "Repository import finished",
			Summary: fmt.Sprintf("Imported %d commit%s for %s in %s.", imported, pluralize(imported), repo.Name, time.Since(start).Round(time.Millisecond)),
			Lines: []string{
				fmt.Sprintf("Repository: %s", repo.Name),
				fmt.Sprintf("Commits imported: %d", imported),
				fmt.Sprintf("Window: last %d day%s", days, pluralize(days)),
			},
		},
		Repository: repo,
	})
}

func (s *Server) handleAPIImportAll(w http.ResponseWriter, r *http.Request) {
	days, ok := decodeImportDays(r, s.rt.Config().Monitoring.ImportDays)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	start := time.Now()
	repos, err := s.rt.ListRepos(r.Context())
	if err != nil {
		slog.Error("api import all list repos", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to list repositories")
		return
	}

	processed := 0
	importedTotal := 0
	warnings := make([]string, 0)
	for _, repo := range repos {
		if repo.State == models.StateRemoved {
			continue
		}
		processed++
		imported, err := s.rt.ImportRepoHistory(r.Context(), repo.ID, days)
		if err != nil {
			slog.Warn("api import all repo failed", "repo", repo.Name, "err", err)
			warnings = append(warnings, fmt.Sprintf("%s: %v", repo.Name, err))
			continue
		}
		importedTotal += imported
	}

	writeAction(w, http.StatusOK, models.ActionPayload{
		Result: models.OperatorActionResult{
			Action:  "import_all",
			Title:   "History import finished",
			Summary: fmt.Sprintf("Imported %d commit%s across %d repositor%s in %s.", importedTotal, pluralize(importedTotal), processed, pluralizeRepository(processed), time.Since(start).Round(time.Millisecond)),
			Lines: []string{
				fmt.Sprintf("Repositories processed: %d", processed),
				fmt.Sprintf("Commits imported: %d", importedTotal),
				fmt.Sprintf("Window: last %d day%s", days, pluralize(days)),
			},
			Warnings: warnings,
		},
	})
}

func (s *Server) handleAPIRescanAll(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	repos, err := s.rt.ListRepos(r.Context())
	if err != nil {
		slog.Error("api rescan all list repos", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to list repositories")
		return
	}

	processed := 0
	warnings := make([]string, 0)
	for _, repo := range repos {
		if repo.State != models.StateActive || !repo.IsMonitored {
			continue
		}
		processed++
		if err := s.rt.RefreshRepository(r.Context(), repo.ID, false); err != nil {
			slog.Warn("api rescan all repo failed", "repo", repo.Name, "err", err)
			warnings = append(warnings, fmt.Sprintf("%s: %v", repo.Name, err))
		}
	}

	writeAction(w, http.StatusOK, models.ActionPayload{
		Result: models.OperatorActionResult{
			Action:  "rescan_all",
			Title:   "Repository rescan finished",
			Summary: fmt.Sprintf("Rescanned %d active repositor%s in %s.", processed, pluralizeRepository(processed), time.Since(start).Round(time.Millisecond)),
			Lines: []string{
				fmt.Sprintf("Active monitored repositories: %d", processed),
				"Live working-tree state refreshed from local git data.",
				"Rebuild analytics separately when you want sessions, streaks, and score updated.",
			},
			Warnings: warnings,
		},
	})
}

func (s *Server) handleAPIRebuildAnalytics(w http.ResponseWriter, r *http.Request) {
	report, err := s.rt.RebuildAnalytics(r.Context())
	if err != nil {
		slog.Error("api rebuild analytics", "err", err)
		writeError(w, http.StatusInternalServerError, "rebuild failed: "+err.Error())
		return
	}

	writeAction(w, http.StatusOK, models.ActionPayload{
		Result: models.OperatorActionResult{
			Action:  "rebuild_analytics",
			Title:   "Analytics rebuild finished",
			Summary: fmt.Sprintf("Rebuilt sessions, rollups, and achievements in %s.", report.Elapsed.Round(time.Millisecond)),
			Lines: []string{
				fmt.Sprintf("Sessions written: %d", report.SessionsWritten),
				fmt.Sprintf("Rollups written: %d", report.RollupsWritten),
				fmt.Sprintf("Achievements written: %d", report.AchievementsWritten),
			},
		},
	})
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
	paths, _ := config.DiscoverPaths()
	if paths == nil {
		paths = &config.AppPaths{}
	}
	paths.ConfigFile = savedPath
	paths.ConfigDir = filepath.Dir(savedPath)

	writeAction(w, http.StatusOK, models.ActionPayload{
		Result: models.OperatorActionResult{
			Action:  "save_settings",
			Title:   "Settings saved",
			Summary: fmt.Sprintf("Saved GitPulse settings to %s.", savedPath),
			Lines: []string{
				fmt.Sprintf("Timezone: %s", next.UI.Timezone),
				fmt.Sprintf("Import days: %d", next.Monitoring.ImportDays),
				fmt.Sprintf("Session gap minutes: %d", next.Monitoring.SessionGapMinutes),
			},
		},
		Settings: &models.SettingsView{
			Config: *next,
			Paths:  *paths,
		},
	})
}

func decodeImportDays(r *http.Request, fallback int) (int, bool) {
	if fallback < 1 {
		fallback = 30
	}
	if r.ContentLength == 0 {
		return fallback, true
	}

	var body struct {
		Days int `json:"days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return 0, false
	}
	if body.Days < 1 {
		return fallback, true
	}
	return body.Days, true
}

func pluralize(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func pluralizeRepository(n int) string {
	if n == 1 {
		return "y"
	}
	return "ies"
}
