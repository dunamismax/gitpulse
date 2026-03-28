package config

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSaveRoundTrip(t *testing.T) {
	t.Parallel()

	token := "ghp_test"
	cfg := &AppConfig{
		Authors: []AuthorIdentity{
			{
				Email:   "you@example.com",
				Name:    "Your Name",
				Aliases: []string{"you@work.com"},
			},
		},
		Goals: GoalSettings{
			ChangedLinesPerDay: 321,
			CommitsPerDay:      4,
			FocusMinutesPerDay: 120,
		},
		Patterns: PatternSettings{
			Include: []string{"cmd/**"},
			Exclude: []string{".git/**", "dist/**"},
		},
		Github: GithubSettings{
			Enabled:            true,
			Token:              &token,
			VerifyRemotePushes: true,
		},
		Monitoring: MonitoringSettings{
			ImportDays:         45,
			SessionGapMinutes:  20,
			RepoDiscoveryDepth: 7,
		},
		UI: UISettings{
			Timezone:           "America/New_York",
			DayBoundaryMinutes: 90,
		},
		Database: DatabaseSettings{
			Path: "/tmp/gitpulse.db",
		},
		Server: ServerSettings{
			Host: "127.0.0.1",
			Port: 8123,
		},
	}

	cfgFile := filepath.Join(t.TempDir(), "gitpulse.toml")
	savedPath, err := Save(cfgFile, cfg)
	if err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	if savedPath != cfgFile {
		t.Fatalf("Save() path = %q, want %q", savedPath, cfgFile)
	}

	loaded, err := Load(cfgFile)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if !reflect.DeepEqual(loaded, cfg) {
		t.Fatalf("Load() mismatch\n got: %#v\nwant: %#v", loaded, cfg)
	}
}

func TestSaveOmitsEmptyAuthorDetails(t *testing.T) {
	t.Parallel()

	cfgFile := filepath.Join(t.TempDir(), "gitpulse.toml")
	cfg := &AppConfig{
		Authors: []AuthorIdentity{{Email: "you@example.com"}},
		Database: DatabaseSettings{
			Path: "/tmp/gitpulse.db",
		},
	}

	if _, err := Save(cfgFile, cfg); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	data, err := os.ReadFile(cfgFile)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	text := string(data)
	if strings.Contains(text, "name = \"\"") {
		t.Fatalf("config file unexpectedly contained empty author name:\n%s", text)
	}
	if strings.Contains(text, "aliases = []") {
		t.Fatalf("config file unexpectedly contained empty author aliases:\n%s", text)
	}
}

func TestSaveOverwritesExistingConfig(t *testing.T) {
	t.Parallel()

	cfgFile := filepath.Join(t.TempDir(), "gitpulse.toml")

	first := &AppConfig{
		Goals: GoalSettings{ChangedLinesPerDay: 100},
		Database: DatabaseSettings{
			Path: "/tmp/first.db",
		},
	}
	second := &AppConfig{
		Goals: GoalSettings{ChangedLinesPerDay: 200},
		Database: DatabaseSettings{
			Path: "/tmp/second.db",
		},
	}

	if _, err := Save(cfgFile, first); err != nil {
		t.Fatalf("first Save() error = %v", err)
	}
	if _, err := Save(cfgFile, second); err != nil {
		t.Fatalf("second Save() error = %v", err)
	}

	loaded, err := Load(cfgFile)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if got := loaded.Goals.ChangedLinesPerDay; got != 200 {
		t.Fatalf("changed_lines_per_day = %d, want 200", got)
	}
	if got := loaded.Database.Path; got != second.Database.Path {
		t.Fatalf("database path = %q, want %q", got, second.Database.Path)
	}
}
