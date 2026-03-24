package web

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dunamismax/gitpulse/internal/config"
	gitruntime "github.com/dunamismax/gitpulse/internal/runtime"
)

func TestHandleSettingsSavePersistsConfig(t *testing.T) {
	t.Parallel()

	token := "keep-me"
	base := &config.AppConfig{
		Authors: []config.AuthorIdentity{
			{
				Email:   "old@example.com",
				Name:    "Existing Name",
				Aliases: []string{"old+alias@example.com"},
			},
		},
		Goals: config.GoalSettings{
			ChangedLinesPerDay: 250,
			CommitsPerDay:      3,
			FocusMinutesPerDay: 90,
		},
		Patterns: config.PatternSettings{
			Include: []string{"internal/**"},
			Exclude: []string{".git/**"},
		},
		Github: config.GithubSettings{
			Token: &token,
		},
		Monitoring: config.MonitoringSettings{
			ImportDays:         30,
			SessionGapMinutes:  15,
			RepoDiscoveryDepth: 5,
			WatcherDebounceMs:  700,
			IdlePollSeconds:    20,
			LivePollSeconds:    2,
		},
		UI: config.UISettings{
			Timezone:           "UTC",
			DayBoundaryMinutes: 0,
		},
		Database: config.DatabaseSettings{
			Path: filepath.Join(t.TempDir(), "gitpulse.db"),
		},
		Server: config.ServerSettings{
			Host: "127.0.0.1",
			Port: 7467,
		},
	}

	rt := new(gitruntime.Runtime)
	rt.SetConfig(base)

	cfgFile := filepath.Join(t.TempDir(), "gitpulse.toml")
	srv := &Server{
		rt:         rt,
		configFile: cfgFile,
	}

	form := url.Values{
		"authors":                     {"old@example.com\nnew@example.com\nold@example.com"},
		"changed_lines_per_day":       {"321"},
		"commits_per_day":             {"5"},
		"focus_minutes_per_day":       {"135"},
		"timezone":                    {"America/Chicago"},
		"day_boundary_minutes":        {"45"},
		"session_gap_minutes":         {"25"},
		"import_days":                 {"14"},
		"include_patterns":            {"cmd/**\ndocs/**"},
		"exclude_patterns":            {".git/**\ndist/**"},
		"github_enabled":              {"on"},
		"github_verify_remote_pushes": {"on"},
		"github_token":                {""},
	}

	req := httptest.NewRequest(http.MethodPost, "/settings", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()

	srv.handleSettingsSave(rec, req)

	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusSeeOther)
	}
	if got := rec.Header().Get("Location"); got != "/settings?saved=1" {
		t.Fatalf("redirect = %q, want %q", got, "/settings?saved=1")
	}

	loaded, err := config.Load(cfgFile)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if got := loaded.Goals.ChangedLinesPerDay; got != 321 {
		t.Fatalf("changed_lines_per_day = %d, want 321", got)
	}
	if got := loaded.Monitoring.ImportDays; got != 14 {
		t.Fatalf("import_days = %d, want 14", got)
	}
	if got := loaded.UI.Timezone; got != "America/Chicago" {
		t.Fatalf("timezone = %q, want %q", got, "America/Chicago")
	}
	if got := len(loaded.Authors); got != 2 {
		t.Fatalf("authors len = %d, want 2", got)
	}
	if got := loaded.Authors[0].Name; got != "Existing Name" {
		t.Fatalf("existing author name = %q, want preserved value", got)
	}
	if got := loaded.Authors[0].Aliases; len(got) != 1 || got[0] != "old+alias@example.com" {
		t.Fatalf("existing author aliases = %#v, want preserved alias", got)
	}
	if loaded.Github.Token == nil || *loaded.Github.Token != token {
		t.Fatalf("github token was not preserved")
	}

	current := rt.Config()
	if current.Github.Token == nil || *current.Github.Token != token {
		t.Fatalf("runtime token was not preserved")
	}
	if got := current.Patterns.Include; len(got) != 2 || got[0] != "cmd/**" || got[1] != "docs/**" {
		t.Fatalf("runtime include patterns = %#v", got)
	}
}
