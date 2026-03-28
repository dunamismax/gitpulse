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
	Email   string   `json:"email" mapstructure:"email" toml:"email"`
	Name    string   `json:"name" mapstructure:"name" toml:"name,omitempty"`
	Aliases []string `json:"aliases" mapstructure:"aliases" toml:"aliases,omitempty"`
}

// GoalSettings holds daily productivity targets.
type GoalSettings struct {
	ChangedLinesPerDay int `json:"changed_lines_per_day" mapstructure:"changed_lines_per_day" toml:"changed_lines_per_day"`
	CommitsPerDay      int `json:"commits_per_day" mapstructure:"commits_per_day" toml:"commits_per_day"`
	FocusMinutesPerDay int `json:"focus_minutes_per_day" mapstructure:"focus_minutes_per_day" toml:"focus_minutes_per_day"`
}

// MonitoringSettings controls manual ingest and analytics behavior.
type MonitoringSettings struct {
	ImportDays         int   `json:"import_days" mapstructure:"import_days" toml:"import_days"`
	SessionGapMinutes  int64 `json:"session_gap_minutes" mapstructure:"session_gap_minutes" toml:"session_gap_minutes"`
	RepoDiscoveryDepth int   `json:"repo_discovery_depth" mapstructure:"repo_discovery_depth" toml:"repo_discovery_depth"`
}

// UISettings controls display preferences.
type UISettings struct {
	Timezone           string `json:"timezone" mapstructure:"timezone" toml:"timezone"`
	DayBoundaryMinutes int    `json:"day_boundary_minutes" mapstructure:"day_boundary_minutes" toml:"day_boundary_minutes"`
}

// PatternSettings controls which file paths are included in analytics.
type PatternSettings struct {
	Include []string `json:"include" mapstructure:"include" toml:"include"`
	Exclude []string `json:"exclude" mapstructure:"exclude" toml:"exclude"`
}

// GithubSettings controls optional GitHub API integration.
type GithubSettings struct {
	Enabled            bool    `json:"enabled" mapstructure:"enabled" toml:"enabled"`
	Token              *string `json:"token" mapstructure:"token" toml:"token,omitempty"`
	VerifyRemotePushes bool    `json:"verify_remote_pushes" mapstructure:"verify_remote_pushes" toml:"verify_remote_pushes"`
}

// DatabaseSettings holds the current database connection string.
type DatabaseSettings struct {
	Path string `json:"path" mapstructure:"path" toml:"path"`
}

// ServerSettings holds the web server listen address.
type ServerSettings struct {
	Host string `json:"host" mapstructure:"host" toml:"host"`
	Port int    `json:"port" mapstructure:"port" toml:"port"`
}

// AppConfig is the root configuration structure.
type AppConfig struct {
	Authors    []AuthorIdentity   `json:"authors" mapstructure:"authors" toml:"authors"`
	Goals      GoalSettings       `json:"goals" mapstructure:"goals" toml:"goals"`
	Patterns   PatternSettings    `json:"patterns" mapstructure:"patterns" toml:"patterns"`
	Github     GithubSettings     `json:"github" mapstructure:"github" toml:"github"`
	Monitoring MonitoringSettings `json:"monitoring" mapstructure:"monitoring" toml:"monitoring"`
	UI         UISettings         `json:"ui" mapstructure:"ui" toml:"ui"`
	Database   DatabaseSettings   `json:"database" mapstructure:"database" toml:"database"`
	Server     ServerSettings     `json:"server" mapstructure:"server" toml:"server"`
}

// AppPaths holds platform-specific filesystem paths.
type AppPaths struct {
	ConfigDir  string `json:"config_dir"`
	DataDir    string `json:"data_dir"`
	ConfigFile string `json:"config_file"`
}

// defaultExcludePatterns covers common noisy/generated paths.
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
	v.SetDefault("ui.timezone", "UTC")
	v.SetDefault("ui.day_boundary_minutes", 0)
	v.SetDefault("server.host", "127.0.0.1")
	v.SetDefault("server.port", 7467)
	v.SetDefault("patterns.exclude", defaultExcludePatterns)
	if paths, err := DiscoverPaths(); err == nil {
		v.SetDefault("database.path", filepath.Join(paths.DataDir, "gitpulse.db"))
	}

	resolvedCfgFile, err := ResolveConfigFile(cfgFile)
	if err != nil {
		return nil, err
	}
	v.SetConfigFile(resolvedCfgFile)

	// Environment variable overrides: GITPULSE_SERVER__PORT, GITPULSE_DATABASE__PATH, etc.
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
