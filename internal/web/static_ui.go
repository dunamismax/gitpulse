package web

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

var staticShellRoutes = map[string]string{
	"/":            "index.html",
	"/repositories": "repositories/index.html",
	"/sessions":     "sessions/index.html",
	"/achievements": "achievements/index.html",
	"/settings":     "settings/index.html",
}

// NewStaticUIHandler serves the built Astro frontend directly from disk.
func NewStaticUIHandler(distDir string) (http.Handler, error) {
	if strings.TrimSpace(distDir) == "" {
		return nil, fmt.Errorf("frontend web dist directory is required")
	}

	indexPath := filepath.Join(distDir, "index.html")
	if info, err := os.Stat(indexPath); err != nil || info.IsDir() {
		if err == nil {
			err = fmt.Errorf("%s is a directory", indexPath)
		}
		return nil, fmt.Errorf("frontend web build not found at %s: %w", indexPath, err)
	}

	return &staticUIHandler{
		distDir: distDir,
		files:   http.FileServer(http.Dir(distDir)),
	}, nil
}

type staticUIHandler struct {
	distDir string
	files   http.Handler
}

func (h *staticUIHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.NotFound(w, r)
		return
	}

	requestPath := cleanStaticUIPath(r.URL.Path)
	if requestPath == "" {
		requestPath = "/"
	}

	if shellPath, ok := staticShellPath(requestPath); ok {
		http.ServeFile(w, r, filepath.Join(h.distDir, filepath.FromSlash(shellPath)))
		return
	}

	if h.hasFile(requestPath) {
		h.files.ServeHTTP(w, r)
		return
	}

	http.NotFound(w, r)
}

func staticShellPath(requestPath string) (string, bool) {
	if shellPath, ok := staticShellRoutes[requestPath]; ok {
		return shellPath, true
	}

	if strings.HasPrefix(requestPath, "/repositories/") && requestPath != "/repositories" {
		return "repositories/detail/index.html", true
	}

	return "", false
}

func cleanStaticUIPath(requestPath string) string {
	cleaned := path.Clean("/" + requestPath)
	if cleaned == "." || cleaned == "/." {
		return "/"
	}
	return cleaned
}

func (h *staticUIHandler) hasFile(requestPath string) bool {
	relative := strings.TrimPrefix(requestPath, "/")
	if relative == "" {
		return false
	}

	fullPath := filepath.Join(h.distDir, filepath.FromSlash(relative))
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		return false
	}
	return true
}
