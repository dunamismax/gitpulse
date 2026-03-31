// Command gitpulse is the CLI entry point for the GitPulse analytics tool.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"

	"github.com/dunamismax/gitpulse/internal/config"
	gitpkg "github.com/dunamismax/gitpulse/internal/git"
	"github.com/dunamismax/gitpulse/internal/runtime"
	"github.com/dunamismax/gitpulse/internal/web"
)

func main() {
	if err := rootCmd().Execute(); err != nil {
		os.Exit(1)
	}
}

func rootCmd() *cobra.Command {
	var cfgFile string

	root := &cobra.Command{
		Use:   "gitpulse",
		Short: "Local-first git activity analytics",
		Long: `GitPulse tracks commits, sessions, and streaks across repositories
without uploading source code. All data stays local in a SQLite database.`,
		SilenceUsage: true,
	}

	root.PersistentFlags().StringVar(&cfgFile, "config", "", "config file path (default: platform config dir)")

	root.AddCommand(
		serveCmd(&cfgFile),
		tuiCmd(&cfgFile),
		addCmd(&cfgFile),
		rescanCmd(&cfgFile),
		importCmd(&cfgFile),
		rebuildCmd(&cfgFile),
		doctorCmd(&cfgFile),
	)

	return root
}

// loadRuntime loads config and boots the runtime. No background tasks are
// started; the caller is responsible for starting them if needed.
func loadRuntime(cfgFile string) (*runtime.Runtime, *config.AppConfig, error) {
	cfg, err := config.Load(cfgFile)
	if err != nil {
		return nil, nil, fmt.Errorf("load config: %w", err)
	}

	rt, err := runtime.New(context.Background(), cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("init runtime: %w", err)
	}

	return rt, cfg, nil
}

func resolveDoctorPaths(cfgFile string) (*config.AppPaths, error) {
	paths, err := config.DiscoverPaths()
	if err != nil {
		return nil, err
	}
	if paths == nil {
		paths = &config.AppPaths{}
	}

	resolved, err := config.ResolveConfigFile(cfgFile)
	if err != nil {
		return nil, err
	}
	if resolved != "" {
		paths.ConfigFile = resolved
		paths.ConfigDir = filepath.Dir(resolved)
	}

	return paths, nil
}

// serveCmd starts the web server.
func serveCmd(cfgFile *string) *cobra.Command {
	var port int
	var host string

	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the web dashboard server",
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, cfg, err := loadRuntime(*cfgFile)
			if err != nil {
				return err
			}
			defer rt.Close()

			if port == 0 {
				port = cfg.Server.Port
			}
			if host == "" {
				host = cfg.Server.Host
			}

			webDistDir, err := locateFrontendWebDistDir()
			if err != nil {
				return err
			}

			uiHandler, err := web.NewStaticUIHandler(webDistDir)
			if err != nil {
				return fmt.Errorf("load frontend web build: %w", err)
			}

			srv := web.New(rt, *cfgFile, uiHandler)
			addr := fmt.Sprintf("%s:%d", host, port)
			httpServer := &http.Server{Addr: addr, Handler: srv}

			serveCtx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt)
			defer stop()

			errCh := make(chan error, 1)
			go func() {
				slog.Info("web server listening", "addr", addr)
				errCh <- httpServer.ListenAndServe()
			}()

			slog.Info("frontend web build ready", "dist_dir", webDistDir, "origin", apiBaseURLForServeHost(host, port))
			fmt.Printf("GitPulse running at http://%s\n", addr)

			select {
			case err := <-errCh:
				if errors.Is(err, http.ErrServerClosed) {
					return nil
				}
				return err
			case <-serveCtx.Done():
				shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := httpServer.Shutdown(shutdownCtx); err != nil && !errors.Is(err, context.Canceled) {
					return fmt.Errorf("shutdown server: %w", err)
				}
				if err := <-errCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
					return err
				}
				return nil
			}
		},
	}

	cmd.Flags().IntVar(&port, "port", 0, "listen port (overrides config)")
	cmd.Flags().StringVar(&host, "host", "", "listen host (overrides config)")
	return cmd
}

// addCmd registers a new repository or folder target.
func addCmd(cfgFile *string) *cobra.Command {
	return &cobra.Command{
		Use:   "add <path>",
		Short: "Add a repository or folder to track",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, _, err := loadRuntime(*cfgFile)
			if err != nil {
				return err
			}
			defer rt.Close()

			added, err := rt.AddTarget(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			for _, r := range added {
				fmt.Println(r.RootPath)
			}
			fmt.Printf("Added %d repository(s)\n", len(added))
			return nil
		},
	}
}

// rescanCmd refreshes one or all repositories.
func rescanCmd(cfgFile *string) *cobra.Command {
	var all bool
	var selector string

	cmd := &cobra.Command{
		Use:   "rescan",
		Short: "Refresh git state for repositories",
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, _, err := loadRuntime(*cfgFile)
			if err != nil {
				return err
			}
			defer rt.Close()

			if all || selector == "" {
				fmt.Println("Rescanning all repositories...")
				return rt.RescanAll(cmd.Context())
			}

			repo, err := rt.FindRepo(cmd.Context(), selector)
			if err != nil || repo == nil {
				return fmt.Errorf("repository not found: %s", selector)
			}
			fmt.Printf("Rescanning %s...\n", repo.Name)
			return rt.RefreshRepository(cmd.Context(), repo.ID, true)
		},
	}

	cmd.Flags().BoolVar(&all, "all", false, "rescan all repositories")
	cmd.Flags().StringVar(&selector, "repo", "", "repository name, path, or ID")
	return cmd
}

// importCmd imports commit history.
func importCmd(cfgFile *string) *cobra.Command {
	var days int
	var all bool
	var selector string

	cmd := &cobra.Command{
		Use:   "import",
		Short: "Import commit history from git log",
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, cfg, err := loadRuntime(*cfgFile)
			if err != nil {
				return err
			}
			defer rt.Close()

			if days == 0 {
				days = cfg.Monitoring.ImportDays
			}

			if all || selector == "" {
				repos, err := rt.ListRepos(cmd.Context())
				if err != nil {
					return err
				}
				total := 0
				for _, r := range repos {
					n, err := rt.ImportRepoHistory(cmd.Context(), r.ID, days)
					if err != nil {
						slog.Warn("import failed", "repo", r.Name, "err", err)
						continue
					}
					total += n
					fmt.Printf("  %s: %d commits inserted\n", r.Name, n)
				}
				fmt.Printf("Total: %d commits inserted\n", total)
				return nil
			}

			repo, err := rt.FindRepo(cmd.Context(), selector)
			if err != nil || repo == nil {
				return fmt.Errorf("repository not found: %s", selector)
			}
			n, err := rt.ImportRepoHistory(cmd.Context(), repo.ID, days)
			if err != nil {
				return err
			}
			fmt.Printf("%s: %d commits inserted\n", repo.Name, n)
			return nil
		},
	}

	cmd.Flags().IntVar(&days, "days", 0, "number of days of history to import (default: from config)")
	cmd.Flags().BoolVar(&all, "all", false, "import for all repositories")
	cmd.Flags().StringVar(&selector, "repo", "", "repository name, path, or ID")
	return cmd
}

// rebuildCmd forces a full analytics rebuild.
func rebuildCmd(cfgFile *string) *cobra.Command {
	return &cobra.Command{
		Use:   "rebuild-rollups",
		Short: "Force a full analytics rebuild",
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, _, err := loadRuntime(*cfgFile)
			if err != nil {
				return err
			}
			defer rt.Close()

			fmt.Println("Rebuilding analytics...")
			report, err := rt.RebuildAnalytics(cmd.Context())
			if err != nil {
				return err
			}
			fmt.Printf("Sessions written:     %d\n", report.SessionsWritten)
			fmt.Printf("Rollups written:      %d\n", report.RollupsWritten)
			fmt.Printf("Achievements written: %d\n", report.AchievementsWritten)
			fmt.Printf("Elapsed:              %s\n", report.Elapsed)
			return nil
		},
	}
}

// doctorCmd prints diagnostic information.
func doctorCmd(cfgFile *string) *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "Print diagnostic information",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()

			// Git availability.
			ver, err := gitpkg.GitVersion(ctx)
			if err != nil {
				fmt.Println("git: NOT FOUND")
			} else {
				fmt.Printf("git: %s\n", ver)
			}

			// Config paths.
			paths, err := resolveDoctorPaths(*cfgFile)
			if err != nil {
				fmt.Printf("config paths: error: %v\n", err)
			} else {
				fmt.Printf("config dir:  %s\n", paths.ConfigDir)
				fmt.Printf("data dir:    %s\n", paths.DataDir)
				fmt.Printf("config file: %s\n", paths.ConfigFile)
			}

			// Try to load config and connect.
			cfg, err := config.Load(*cfgFile)
			if err != nil {
				fmt.Printf("config: error: %v\n", err)
				return nil
			}
			fmt.Printf("database path: %s\n", displayDatabasePath(cfg.Database.Path))

			rt, _, err := loadRuntime(*cfgFile)
			if err != nil {
				fmt.Printf("runtime: error: %v\n", err)
				return nil
			}
			defer rt.Close()

			repos, err := rt.ListRepos(ctx)
			if err != nil {
				fmt.Printf("repos: error: %v\n", err)
				return nil
			}
			fmt.Printf("repositories: %d tracked\n", len(repos))
			for _, r := range repos {
				fmt.Printf("  [%s] %s  %s\n", r.State, r.Name, r.RootPath)
			}
			return nil
		},
	}
}

// displayDatabasePath normalizes empty database paths for diagnostic output.
func displayDatabasePath(path string) string {
	if path == "" {
		return "(not set)"
	}
	return path
}
