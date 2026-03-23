package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	toml "github.com/pelletier/go-toml/v2"
)

// ResolveConfigFile returns the active config file path.
func ResolveConfigFile(cfgFile string) (string, error) {
	if cfgFile == "" {
		paths, err := DiscoverPaths()
		if err != nil {
			return "", err
		}
		return paths.ConfigFile, nil
	}

	abs, err := filepath.Abs(cfgFile)
	if err != nil {
		return "", fmt.Errorf("resolve config file: %w", err)
	}
	return abs, nil
}

// Save writes cfg to the active TOML config file using an atomic rename.
func Save(cfgFile string, cfg *AppConfig) (string, error) {
	if cfg == nil {
		return "", fmt.Errorf("config is nil")
	}

	path, err := ResolveConfigFile(cfgFile)
	if err != nil {
		return "", err
	}

	payload, err := toml.Marshal(cfg.Clone())
	if err != nil {
		return "", fmt.Errorf("marshal config: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("create config dir: %w", err)
	}

	tmp, err := os.CreateTemp(dir, "gitpulse-*.toml")
	if err != nil {
		return "", fmt.Errorf("create temp config: %w", err)
	}
	tmpName := tmp.Name()
	removeTemp := true
	defer func() {
		_ = tmp.Close()
		if removeTemp {
			_ = os.Remove(tmpName)
		}
	}()

	if err := tmp.Chmod(0o600); err != nil && runtime.GOOS != "windows" {
		return "", fmt.Errorf("set temp config permissions: %w", err)
	}
	if _, err := tmp.Write(payload); err != nil {
		return "", fmt.Errorf("write temp config: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		return "", fmt.Errorf("sync temp config: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("close temp config: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		if runtime.GOOS != "windows" {
			return "", fmt.Errorf("replace config file: %w", err)
		}
		if removeErr := os.Remove(path); removeErr != nil && !os.IsNotExist(removeErr) {
			return "", fmt.Errorf("replace config file: %w", err)
		}
		if err := os.Rename(tmpName, path); err != nil {
			return "", fmt.Errorf("replace config file: %w", err)
		}
	}

	removeTemp = false
	return path, nil
}

// Clone returns a deep copy of the config tree.
func (c *AppConfig) Clone() *AppConfig {
	if c == nil {
		return &AppConfig{}
	}

	clone := *c

	if c.Authors != nil {
		clone.Authors = make([]AuthorIdentity, len(c.Authors))
		for i, author := range c.Authors {
			clone.Authors[i] = author
			clone.Authors[i].Aliases = cloneStrings(author.Aliases)
		}
	}

	clone.Patterns.Include = cloneStrings(c.Patterns.Include)
	clone.Patterns.Exclude = cloneStrings(c.Patterns.Exclude)

	if c.Github.Token != nil {
		token := *c.Github.Token
		clone.Github.Token = &token
	}

	return &clone
}

func cloneStrings(values []string) []string {
	if values == nil {
		return nil
	}
	out := make([]string, len(values))
	copy(out, values)
	return out
}
