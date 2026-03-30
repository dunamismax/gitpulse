package web

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestNewStaticUIHandlerServesShellRoutesAndAssets(t *testing.T) {
	distDir := t.TempDir()
	writeStaticUITestFile(t, distDir, "index.html", "dashboard-shell")
	writeStaticUITestFile(t, distDir, "repositories/index.html", "repositories-shell")
	writeStaticUITestFile(t, distDir, "repositories/detail/index.html", "repo-detail-shell")
	writeStaticUITestFile(t, distDir, "sessions/index.html", "sessions-shell")
	writeStaticUITestFile(t, distDir, "achievements/index.html", "achievements-shell")
	writeStaticUITestFile(t, distDir, "settings/index.html", "settings-shell")
	writeStaticUITestFile(t, distDir, "_astro/app.js", "console.log('asset');")

	handler, err := NewStaticUIHandler(distDir)
	if err != nil {
		t.Fatalf("NewStaticUIHandler: %v", err)
	}

	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "dashboard", path: "/", want: "dashboard-shell"},
		{name: "repositories", path: "/repositories", want: "repositories-shell"},
		{name: "repository detail", path: "/repositories/1234", want: "repo-detail-shell"},
		{name: "sessions", path: "/sessions", want: "sessions-shell"},
		{name: "achievements", path: "/achievements", want: "achievements-shell"},
		{name: "settings", path: "/settings", want: "settings-shell"},
		{name: "asset", path: "/_astro/app.js", want: "console.log('asset');"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			resp := rec.Result()
			defer func() { _ = resp.Body.Close() }()
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("GET %s status = %d, want 200", tc.path, resp.StatusCode)
			}
			body := readStaticUITestBody(t, resp)
			if body != tc.want {
				t.Fatalf("GET %s body = %q, want %q", tc.path, body, tc.want)
			}
		})
	}
}

func TestNewStaticUIHandlerRejectsNonGetRequests(t *testing.T) {
	distDir := t.TempDir()
	writeStaticUITestFile(t, distDir, "index.html", "dashboard-shell")
	writeStaticUITestFile(t, distDir, "repositories/detail/index.html", "repo-detail-shell")

	handler, err := NewStaticUIHandler(distDir)
	if err != nil {
		t.Fatalf("NewStaticUIHandler: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/repositories/1234", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	resp := rec.Result()
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("POST /repositories/1234 status = %d, want 404", resp.StatusCode)
	}
}

func TestNewStaticUIHandlerRequiresBuiltIndex(t *testing.T) {
	_, err := NewStaticUIHandler(t.TempDir())
	if err == nil {
		t.Fatal("expected missing dist index to fail")
	}
}

func writeStaticUITestFile(t *testing.T, root string, relative string, content string) {
	t.Helper()
	fullPath := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", relative, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s): %v", relative, err)
	}
}

func readStaticUITestBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	return string(body)
}
