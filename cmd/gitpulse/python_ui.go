package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type managedPythonUI struct {
	projectDir string
	apiBaseURL string
	upstream   *url.URL
	proxy      *httputil.ReverseProxy
	cmd        *exec.Cmd
}

func startManagedPythonUI(projectDir, apiBaseURL string) (*managedPythonUI, error) {
	if projectDir == "" {
		return nil, fmt.Errorf("python UI project directory is required")
	}

	if _, err := exec.LookPath("uv"); err != nil {
		return nil, fmt.Errorf("uv is required to launch the Python UI: %w", err)
	}

	port, err := reserveLoopbackPort()
	if err != nil {
		return nil, fmt.Errorf("reserve python UI port: %w", err)
	}

	upstream, err := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	if err != nil {
		return nil, fmt.Errorf("build python UI URL: %w", err)
	}

	cmd := exec.Command("uv", "run", "--project", projectDir, "gitpulse-ui")
	cmd.Dir = projectDir
	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		"GITPULSE_UI_HOST=127.0.0.1",
		fmt.Sprintf("GITPULSE_UI_PORT=%d", port),
		fmt.Sprintf("GITPULSE_UI_API_BASE_URL=%s", apiBaseURL),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start python UI: %w", err)
	}

	ui := &managedPythonUI{
		projectDir: projectDir,
		apiBaseURL: apiBaseURL,
		upstream:   upstream,
		cmd:        cmd,
	}
	ui.proxy = ui.newReverseProxy()

	if err := ui.waitUntilReady(20 * time.Second); err != nil {
		_ = ui.Shutdown(context.Background())
		return nil, err
	}

	slog.Info("python UI ready", "project_dir", projectDir, "upstream", upstream.String(), "api_base_url", apiBaseURL)
	return ui, nil
}

func (ui *managedPythonUI) Handler() http.Handler {
	return ui.proxy
}

func (ui *managedPythonUI) Shutdown(ctx context.Context) error {
	if ui == nil || ui.cmd == nil || ui.cmd.Process == nil {
		return nil
	}

	if ui.cmd.ProcessState != nil && ui.cmd.ProcessState.Exited() {
		return nil
	}

	if err := ui.cmd.Process.Signal(os.Interrupt); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("interrupt python UI: %w", err)
	}

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- ui.cmd.Wait()
	}()

	select {
	case err := <-waitCh:
		if err != nil && !errors.Is(err, os.ErrProcessDone) {
			return fmt.Errorf("wait for python UI exit: %w", err)
		}
		return nil
	case <-ctx.Done():
		if killErr := ui.cmd.Process.Kill(); killErr != nil && !errors.Is(killErr, os.ErrProcessDone) {
			return fmt.Errorf("kill python UI after shutdown timeout: %w", killErr)
		}
		<-waitCh
		return ctx.Err()
	}
}

func (ui *managedPythonUI) newReverseProxy() *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(ui.upstream)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("python UI proxy error", "path", r.URL.Path, "err", err)
		http.Error(
			w,
			fmt.Sprintf("GitPulse Python UI is unavailable at %s: %v", ui.upstream.String(), err),
			http.StatusBadGateway,
		)
	}
	return proxy
}

func (ui *managedPythonUI) waitUntilReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}
	healthURL := ui.upstream.String() + "/healthz"

	for time.Now().Before(deadline) {
		if ui.cmd.ProcessState != nil && ui.cmd.ProcessState.Exited() {
			return fmt.Errorf("python UI exited before it became ready")
		}

		resp, err := client.Get(healthURL)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}

		time.Sleep(200 * time.Millisecond)
	}

	return fmt.Errorf("python UI did not become ready at %s within %s", healthURL, timeout)
}

func reserveLoopbackPort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	addr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		if closeErr := listener.Close(); closeErr != nil {
			return 0, fmt.Errorf("close loopback listener: %w", closeErr)
		}
		return 0, fmt.Errorf("unexpected listener address type %T", listener.Addr())
	}
	port := addr.Port
	if err := listener.Close(); err != nil {
		return 0, fmt.Errorf("close loopback listener: %w", err)
	}
	return port, nil
}

func locatePythonUIProjectDir() (string, error) {
	candidates := make([]string, 0, 2)

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(cwd, "python-ui"))
	}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "python-ui"))
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "pyproject.toml")); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("python UI project not found relative to working directory or executable")
}

func apiBaseURLForServeHost(host string, port int) string {
	resolvedHost := strings.TrimSpace(host)
	switch resolvedHost {
	case "", "0.0.0.0", "::", "[::]":
		resolvedHost = "127.0.0.1"
	}
	return fmt.Sprintf("http://%s:%d", resolvedHost, port)
}
