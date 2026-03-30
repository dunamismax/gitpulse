package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func locateFrontendWebDistDir() (string, error) {
	candidates := make([]string, 0, 3)

	if configured := strings.TrimSpace(os.Getenv("GITPULSE_WEB_DIST_DIR")); configured != "" {
		candidates = append(candidates, configured)
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "frontend", "web", "dist"))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "frontend", "web", "dist"),
			filepath.Join(exeDir, "dist"),
		)
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf(
		"frontend web build not found. Run `cd frontend && bun install && bun run --filter @gitpulse/web build`, or set GITPULSE_WEB_DIST_DIR",
	)
}


func apiBaseURLForServeHost(host string, port int) string {
	resolvedHost := strings.TrimSpace(host)
	switch resolvedHost {
	case "", "0.0.0.0", "::", "[::]":
		resolvedHost = "127.0.0.1"
	}
	return fmt.Sprintf("http://%s:%d", resolvedHost, port)
}
