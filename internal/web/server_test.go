package web

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dunamismax/gitpulse/internal/config"
	"github.com/dunamismax/gitpulse/internal/models"
	"github.com/dunamismax/gitpulse/internal/runtime"
)

func TestServerRoutesProxyBrowserRequestsAndKeepAPIInGo(t *testing.T) {
	rt := newTestRuntime(t)
	defer rt.Close()

	uiHit := false
	uiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uiHit = true
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("python-ui:" + r.URL.Path))
	})

	srv := New(rt, "", uiHandler)

	uiResp := performRequest(t, srv, http.MethodGet, "/")
	defer func() { _ = uiResp.Body.Close() }()
	if uiResp.StatusCode != http.StatusTeapot {
		t.Fatalf("GET / status = %d, want %d", uiResp.StatusCode, http.StatusTeapot)
	}
	if !uiHit {
		t.Fatal("expected browser request to be forwarded to the UI handler")
	}

	apiResp := performRequest(t, srv, http.MethodGet, "/api/dashboard")
	defer func() { _ = apiResp.Body.Close() }()
	if apiResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/dashboard status = %d, want %d", apiResp.StatusCode, http.StatusOK)
	}

	var dashboard models.DashboardResponse
	if err := json.NewDecoder(apiResp.Body).Decode(&dashboard); err != nil {
		t.Fatalf("decode dashboard response: %v", err)
	}
	if len(dashboard.Data.Summary.Goals) == 0 {
		t.Fatal("expected dashboard JSON payload from Go API to include summary goals")
	}
}

func TestServerRoutesProxyNonAPIFormPosts(t *testing.T) {
	rt := newTestRuntime(t)
	defer rt.Close()

	srv := New(rt, "", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method forwarded to UI handler: %s", r.Method)
		}
		_, _ = w.Write([]byte(r.URL.Path))
	}))

	resp := performRequest(t, srv, http.MethodPost, "/repositories/add")
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /repositories/add status = %d, want %d", resp.StatusCode, http.StatusOK)
	}
	body := readBody(t, resp)
	if strings.TrimSpace(body) != "/repositories/add" {
		t.Fatalf("forwarded path = %q, want %q", body, "/repositories/add")
	}
}

func newTestRuntime(t *testing.T) *runtime.Runtime {
	t.Helper()

	cfg := &config.AppConfig{
		Database: config.DatabaseSettings{
			Path: filepath.Join(t.TempDir(), "gitpulse-test.db"),
		},
		Monitoring: config.MonitoringSettings{
			ImportDays:         30,
			SessionGapMinutes:  15,
			RepoDiscoveryDepth: 5,
		},
		UI: config.UISettings{
			Timezone: "UTC",
		},
	}

	rt, err := runtime.New(context.Background(), cfg)
	if err != nil {
		t.Fatalf("runtime.New: %v", err)
	}
	return rt
}

func performRequest(t *testing.T, handler http.Handler, method string, path string) *http.Response {
	t.Helper()

	req := httptest.NewRequest(method, path, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder.Result()
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return string(body)
}
