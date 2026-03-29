package main

import (
	"path/filepath"
	"testing"
)

func TestResolveDoctorPathsUsesExplicitConfigFile(t *testing.T) {
	t.Parallel()

	cfgFile := filepath.Join(t.TempDir(), "custom", "gitpulse.toml")
	paths, err := resolveDoctorPaths(cfgFile)
	if err != nil {
		t.Fatalf("resolveDoctorPaths() error = %v", err)
	}

	wantFile, err := filepath.Abs(cfgFile)
	if err != nil {
		t.Fatalf("filepath.Abs(%q): %v", cfgFile, err)
	}
	if paths.ConfigFile != wantFile {
		t.Fatalf("config file = %q, want %q", paths.ConfigFile, wantFile)
	}
	if paths.ConfigDir != filepath.Dir(wantFile) {
		t.Fatalf("config dir = %q, want %q", paths.ConfigDir, filepath.Dir(wantFile))
	}
	if paths.DataDir == "" {
		t.Fatal("data dir is empty")
	}
}
