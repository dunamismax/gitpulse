package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/viper"
)

// AuthorIdentity identifies commits belonging to the user.
type AuthorIdentity struct {
	Email   string   `mapstructure:"email"`
	Name    string   `mapstructure:"name"`
	Aliases []string `mapstructure:"aliases"`
}

// GoalSettings holds daily productivity targets.
type GoalSettings struct {
	ChangedLinesPerDay int `mapstructure:"changed_lines_per_day"`
	CommitsPerDay      int `mapstructure:"commits_per_day"`
	FocusMinutesPerDay int `mapstructure:"focus_minutes_per_day"`
}

// MonitoringSettings controls polling and import behavior.
type MonitoringSettings struct {
	ImportDays         int   `mapstructure:"import_days"`
	SessionGapMinutes  int64 `mapstructure:"session_gap_minutes"`
	RepoDiscoveryDepth int   `mapstructure:"repo_discovery_depth"`
	WatcherDebounceMs  int   `mapstructure:"watcher_debounce_ms"`
	IdlePollSeconds    int   `mapstructure:"idle_poll_seconds"`
	LivePollSeconds    int   `mapstructure:"live_poll_seconds"`
}

// UISettings controls display preferences.
type UISettings struct {
	Timezone           string `mapstructure:"timezone"`
	DayBoundaryMinutes int    `mapstructure:"day_boundary_minutes"`
}

// PatternSettings controls which file paths are included in analytics.
type PatternSettings struct {
	Include []string `mapstructure:"include"`
	Exclude []string `mapstructure:"exclude"`
}

// GithubSettings controls optional GitHub API integration.
type GithubSettings struct {
	Enabled            bool    `mapstructure:"enabled"`
	Token              *string `mapstructure:"token"`
	VerifyRemotePushes bool    `mapstructure:"verify_remote_pushes"`
}

// DatabaseSettings holds the PostgreSQL connection string.
type DatabaseSettings struct {
	DSN string `mapstructure:"dsn"`
}

// ServerSettings holds the web server listen address.
type ServerSettings struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

// AppConfig is the root configuration structure.
type AppConfig struct {
	Authors    []AuthorIdentity   `mapstructure:"authors"`
	Goals      GoalSettings       `mapstructure:"goals"`
	Patterns   PatternSettings    `mapstructure:"patterns"`
	Github     GithubSettings     `mapstructure:"github"`
	Monitoring MonitoringSettings `mapstructure:"monitoring"`
	UI         UISettings         `mapstructure:"ui"`
	Database   DatabaseSettings   `mapstructure:"database"`
	Server     ServerSettings     `mapstructure:"server"`
}

// AppPaths holds platform-specific filesystem paths.
type AppPaths struct {
	ConfigDir  string
	DataDir    string
	ConfigFile string
}

// defaultExcludePatterns mirrors the Rust codebase defaults.
var defaultExcludePatterns = []string{
	".git/**",
	"target/**",
	"node_modules/**",
	"build/**",
	"dist/**",
	".next/**",
	"*.lock",
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"Cargo.lock",
	"go.sum",
	"*.png",
	"*.jpg",
	"*.jpeg",
	"*.gif",
	"*.svg",
	"*.ico",
	"*.webp",
	"*.mp4",
	"*.mov",
	"*.avi",
	"*.zip",
	"*.tar",
	"*.gz",
	"*.bz2",
	"*.7z",
	"*.woff",
	"*.woff2",
	"*.ttf",
	"*.eot",
	"*.wasm",
}

// DiscoverPaths returns platform-appropriate config and data directories.
func DiscoverPaths() (*AppPaths, error) {
	var base string

	switch runtime.GOOS {
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("home dir: %w", err)
		}
		base = filepath.Join(home, "Library", "Application Support", "gitpulse")
	case "windows":
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return nil, fmt.Errorf("APPDATA not set")
		}
		base = filepath.Join(appdata, "gitpulse")
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("home dir: %w", err)
		}
		cfg := os.Getenv("XDG_CONFIG_HOME")
		if cfg == "" {
			cfg = filepath.Join(home, ".config")
		}
		base = filepath.Join(cfg, "gitpulse")
	}

	paths := &AppPaths{
		ConfigDir:  base,
		DataDir:    filepath.Join(base, "data"),
		ConfigFile: filepath.Join(base, "gitpulse.toml"),
	}

	if err := os.MkdirAll(paths.DataDir, 0o750); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	return paths, nil
}

// Load reads the TOML config file and applies environment variable overrides.
// Environment variables follow the pattern GITPULSE_SECTION__KEY (double
// underscore for nesting).
func Load(cfgFile string) (*AppConfig, error) {
	v := viper.New()

	// Defaults
	v.SetDefault("goals.changed_lines_per_day", 250)
	v.SetDefault("goals.commits_per_day", 3)
	v.SetDefault("goals.focus_minutes_per_day", 90)
	v.SetDefault("monitoring.import_days", 30)
	v.SetDefault("monitoring.session_gap_minutes", 15)
	v.SetDefault("monitoring.repo_discovery_depth", 5)
	v.SetDefault("monitoring.watcher_debounce_ms", 700)
	v.SetDefault("monitoring.idle_poll_seconds", 20)
	v.SetDefault("monitoring.live_poll_seconds", 2)
	v.SetDefault("ui.timezone", "UTC")
	v.SetDefault("ui.day_boundary_minutes", 0)
	v.SetDefault("server.host", "127.0.0.1")
	v.SetDefault("server.port", 7467)
	v.SetDefault("patterns.exclude", defaultExcludePatterns)

	if cfgFile != "" {
		v.SetConfigFile(cfgFile)
	} else {
		paths, err := DiscoverPaths()
		if err != nil {
			return nil, err
		}
		v.SetConfigFile(paths.ConfigFile)
	}

	// Environment variable overrides: GITPULSE_SERVER__PORT, GITPULSE_DB__DSN, etc.
	v.SetEnvPrefix("GITPULSE")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "__"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		// Config file missing is fine; we use defaults + env vars.
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			if !os.IsNotExist(err) {
				return nil, fmt.Errorf("read config: %w", err)
			}
		}
	}

	var cfg AppConfig
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	return &cfg, nil
}

// AuthorEmails returns the set of configured author email addresses. An empty
// slice means "accept all authors".
func (c *AppConfig) AuthorEmails() []string {
	emails := make([]string, 0, len(c.Authors))
	for _, a := range c.Authors {
		if a.Email != "" {
			emails = append(emails, strings.ToLower(a.Email))
		}
		for _, alias := range a.Aliases {
			if alias != "" {
				emails = append(emails, strings.ToLower(alias))
			}
		}
	}
	return emails
}
