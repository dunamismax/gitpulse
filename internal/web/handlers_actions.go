package web

import (
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/config"
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
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad form", http.StatusBadRequest)
		return
	}

	nextCfg, err := settingsConfigFromForm(s.rt.Config(), r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	savedPath, err := config.Save(s.configFile, nextCfg)
	if err != nil {
		slog.Error("save settings", "config_file", s.configFile, "err", err)
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}

	s.configFile = savedPath
	s.rt.SetConfig(nextCfg)
	slog.Info("settings saved", "config_file", savedPath)
	http.Redirect(w, r, "/settings?saved=1", http.StatusSeeOther)
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

func settingsConfigFromForm(current *config.AppConfig, r *http.Request) (*config.AppConfig, error) {
	next := current.Clone()

	changedLines, err := parseRequiredInt(r.FormValue("changed_lines_per_day"), "changed lines per day", 0)
	if err != nil {
		return nil, err
	}
	commitsPerDay, err := parseRequiredInt(r.FormValue("commits_per_day"), "commits per day", 0)
	if err != nil {
		return nil, err
	}
	focusMinutes, err := parseRequiredInt(r.FormValue("focus_minutes_per_day"), "focus minutes per day", 0)
	if err != nil {
		return nil, err
	}
	dayBoundaryMinutes, err := parseRequiredInt(r.FormValue("day_boundary_minutes"), "day boundary minutes", -1440)
	if err != nil {
		return nil, err
	}
	sessionGapMinutes, err := parseRequiredInt(r.FormValue("session_gap_minutes"), "session gap minutes", 1)
	if err != nil {
		return nil, err
	}
	importDays, err := parseRequiredInt(r.FormValue("import_days"), "import window days", 1)
	if err != nil {
		return nil, err
	}

	timezone := strings.TrimSpace(r.FormValue("timezone"))
	if timezone == "" {
		timezone = "UTC"
	}

	next.Authors = mergeAuthorEmails(current.Authors, splitLines(r.FormValue("authors")))
	next.Goals.ChangedLinesPerDay = changedLines
	next.Goals.CommitsPerDay = commitsPerDay
	next.Goals.FocusMinutesPerDay = focusMinutes
	next.UI.Timezone = timezone
	next.UI.DayBoundaryMinutes = dayBoundaryMinutes
	next.Monitoring.SessionGapMinutes = int64(sessionGapMinutes)
	next.Monitoring.ImportDays = importDays
	next.Patterns.Include = splitLines(r.FormValue("include_patterns"))
	next.Patterns.Exclude = splitLines(r.FormValue("exclude_patterns"))
	next.Github.Enabled = r.FormValue("github_enabled") != ""
	next.Github.VerifyRemotePushes = r.FormValue("github_verify_remote_pushes") != ""

	if token := strings.TrimSpace(r.FormValue("github_token")); token != "" {
		next.Github.Token = &token
	}

	return next, nil
}

func mergeAuthorEmails(existing []config.AuthorIdentity, emails []string) []config.AuthorIdentity {
	byEmail := make(map[string]config.AuthorIdentity, len(existing))
	for _, author := range existing {
		key := strings.ToLower(strings.TrimSpace(author.Email))
		if key == "" {
			continue
		}
		byEmail[key] = author
	}

	merged := make([]config.AuthorIdentity, 0, len(emails))
	seen := make(map[string]struct{}, len(emails))
	for _, email := range emails {
		key := strings.ToLower(strings.TrimSpace(email))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		if author, ok := byEmail[key]; ok {
			author.Email = email
			merged = append(merged, author)
			continue
		}

		merged = append(merged, config.AuthorIdentity{Email: email})
	}

	return merged
}

func parseRequiredInt(raw, label string, min int) (int, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, fmt.Errorf("%s is required", label)
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a whole number", label)
	}
	if parsed < min {
		return 0, fmt.Errorf("%s must be at least %d", label, min)
	}
	return parsed, nil
}
