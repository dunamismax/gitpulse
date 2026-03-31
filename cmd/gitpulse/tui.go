package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/dunamismax/gitpulse/internal/config"
)

func tuiCmd(cfgFile *string) *cobra.Command {
	var apiBaseURL string
	var screen string
	var repo string
	var once bool

	cmd := &cobra.Command{
		Use:   "tui",
		Short: "Launch the terminal operator console preview",
		RunE: func(cmd *cobra.Command, args []string) error {
			frontendDir, err := locateFrontendWorkspaceDir()
			if err != nil {
				return err
			}

			bunPath, err := exec.LookPath("bun")
			if err != nil {
				return fmt.Errorf("bun not found. Install Bun 1.3+ to run `gitpulse tui` from source")
			}

			resolvedBaseURL := strings.TrimSpace(apiBaseURL)
			if resolvedBaseURL == "" && strings.TrimSpace(os.Getenv("GITPULSE_API_BASE_URL")) == "" {
				cfg, err := config.Load(*cfgFile)
				if err == nil {
					resolvedBaseURL = apiBaseURLForServeHost(cfg.Server.Host, cfg.Server.Port)
				}
			}

			argv := []string{"run", "--filter", "@gitpulse/tui", "dev", "--"}
			if screen != "" {
				argv = append(argv, "--screen", screen)
			}
			if repo != "" {
				argv = append(argv, "--repo", repo)
			}
			if once {
				argv = append(argv, "--once")
			}

			child := exec.CommandContext(cmd.Context(), bunPath, argv...)
			child.Dir = frontendDir
			child.Stdin = os.Stdin
			child.Stdout = os.Stdout
			child.Stderr = os.Stderr
			child.Env = os.Environ()
			if resolvedBaseURL != "" {
				child.Env = append(child.Env, fmt.Sprintf("GITPULSE_API_BASE_URL=%s", resolvedBaseURL))
			}

			if err := child.Run(); err != nil {
				return fmt.Errorf("run terminal console: %w", err)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&apiBaseURL, "api-base-url", "", "GitPulse API base URL for the TUI frontend")
	cmd.Flags().StringVar(&screen, "screen", "", "initial screen: dashboard, repositories, repository-detail, sessions, achievements, or settings")
	cmd.Flags().StringVar(&repo, "repo", "", "initial repository selector for the repository detail screen")
	cmd.Flags().BoolVar(&once, "once", false, "render the current screen once and exit")
	return cmd
}

func locateFrontendWorkspaceDir() (string, error) {
	candidates := make([]string, 0, 3)

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "frontend"))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "frontend"),
			filepath.Join(filepath.Dir(exeDir), "frontend"),
		)
	}

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
			if _, err := os.Stat(filepath.Join(candidate, "tui", "src", "index.ts")); err == nil {
				return candidate, nil
			}
		}
	}

	return "", fmt.Errorf(
		"frontend workspace not found. Run `gitpulse tui` from the repo root, or keep the `frontend/` workspace next to the gitpulse binary",
	)
}
