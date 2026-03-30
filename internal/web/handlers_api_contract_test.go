package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/dunamismax/gitpulse/internal/models"
)

func TestDashboardEndpointContract(t *testing.T) {
	srv, _, _ := prepareWorkflowServer(t)

	resp := performRequest(t, srv, http.MethodGet, "/api/dashboard")
	defer closeResponseBody(t, resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/dashboard status = %d, want 200", resp.StatusCode)
	}

	var payload models.DashboardResponse
	decodeJSONResponse(t, resp, &payload)
	if len(payload.Data.RepoCards) != 1 {
		t.Fatalf("repo cards = %d, want 1", len(payload.Data.RepoCards))
	}
	if len(payload.Data.Summary.Goals) != 3 {
		t.Fatalf("summary goals = %d, want 3", len(payload.Data.Summary.Goals))
	}
}

func TestRepositoriesEndpointContract(t *testing.T) {
	srv, repo, _ := prepareWorkflowServer(t)

	listResp := performRequest(t, srv, http.MethodGet, "/api/repositories")
	defer closeResponseBody(t, listResp.Body)
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/repositories status = %d, want 200", listResp.StatusCode)
	}

	var listPayload models.RepositoriesResponse
	decodeJSONResponse(t, listResp, &listPayload)
	if len(listPayload.Data.Repositories) != 1 {
		t.Fatalf("repositories = %d, want 1", len(listPayload.Data.Repositories))
	}

	detailResp := performRequest(t, srv, http.MethodGet, "/api/repositories/"+repo.ID.String())
	defer closeResponseBody(t, detailResp.Body)
	if detailResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/repositories/{id} status = %d, want 200", detailResp.StatusCode)
	}

	var detailPayload models.RepoDetailResponse
	decodeJSONResponse(t, detailResp, &detailPayload)
	if detailPayload.Data.Card.Repo.ID != repo.ID {
		t.Fatalf("repo detail id = %s, want %s", detailPayload.Data.Card.Repo.ID, repo.ID)
	}
	if len(detailPayload.Data.RecentCommits) == 0 {
		t.Fatal("expected recent commits in repository detail payload")
	}
}

func TestSessionsEndpointContract(t *testing.T) {
	srv, _, _ := prepareWorkflowServer(t)

	resp := performRequest(t, srv, http.MethodGet, "/api/sessions")
	defer closeResponseBody(t, resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/sessions status = %d, want 200", resp.StatusCode)
	}

	var payload models.SessionsResponse
	decodeJSONResponse(t, resp, &payload)
	if payload.Data.TotalMinutes < 0 {
		t.Fatalf("total minutes = %d, want non-negative", payload.Data.TotalMinutes)
	}
}

func TestAchievementsEndpointContract(t *testing.T) {
	srv, _, _ := prepareWorkflowServer(t)

	resp := performRequest(t, srv, http.MethodGet, "/api/achievements")
	defer closeResponseBody(t, resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/achievements status = %d, want 200", resp.StatusCode)
	}

	var payload models.AchievementsResponse
	decodeJSONResponse(t, resp, &payload)
	if len(payload.Data.Achievements) == 0 {
		t.Fatal("expected at least one achievement after rebuild")
	}
}

func TestSettingsEndpointContracts(t *testing.T) {
	rt := newTestRuntime(t)
	defer rt.Close()

	srv := New(rt, filepath.Join(t.TempDir(), "gitpulse.toml"), nil)

	getResp := performRequest(t, srv, http.MethodGet, "/api/settings")
	defer closeResponseBody(t, getResp.Body)
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/settings status = %d, want 200", getResp.StatusCode)
	}

	var getPayload models.SettingsResponse
	decodeJSONResponse(t, getResp, &getPayload)
	if getPayload.Data.Config.UI.Timezone != "UTC" {
		t.Fatalf("timezone = %q, want %q", getPayload.Data.Config.UI.Timezone, "UTC")
	}

	saveResp := performJSONRequest(
		t,
		srv,
		http.MethodPost,
		"/api/settings",
		map[string]any{
			"authors":                     []string{"dev@example.com"},
			"changed_lines_per_day":       333,
			"commits_per_day":             4,
			"focus_minutes_per_day":       120,
			"timezone":                    "America/New_York",
			"day_boundary_minutes":        30,
			"session_gap_minutes":         20,
			"import_days":                 14,
			"include_patterns":            []string{"cmd/**"},
			"exclude_patterns":            []string{".git/**"},
			"github_enabled":              false,
			"github_verify_remote_pushes": false,
			"github_token":                "",
		},
	)
	defer closeResponseBody(t, saveResp.Body)
	if saveResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/settings status = %d, want 200", saveResp.StatusCode)
	}

	var savePayload models.ActionResponse
	decodeJSONResponse(t, saveResp, &savePayload)
	if savePayload.Data.Result.Action != "save_settings" {
		t.Fatalf("settings action = %q, want %q", savePayload.Data.Result.Action, "save_settings")
	}
	if savePayload.Data.Settings == nil {
		t.Fatal("expected updated settings payload")
	}
	if savePayload.Data.Settings.Config.UI.Timezone != "America/New_York" {
		t.Fatalf("saved timezone = %q, want %q", savePayload.Data.Settings.Config.UI.Timezone, "America/New_York")
	}
}

func TestActionEndpointContracts(t *testing.T) {
	repoDir := seedContractRepo(t)
	rt := newTestRuntime(t)
	defer rt.Close()

	srv := New(rt, "", nil)
	repo := addRepositoryViaAPI(t, srv, repoDir)

	refreshResp := performJSONRequest(t, srv, http.MethodPost, "/api/repositories/"+repo.ID.String()+"/refresh", nil)
	defer closeResponseBody(t, refreshResp.Body)
	if refreshResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/{id}/refresh status = %d, want 200", refreshResp.StatusCode)
	}
	var refreshPayload models.ActionResponse
	decodeJSONResponse(t, refreshResp, &refreshPayload)
	if refreshPayload.Data.Result.Action != "refresh_repo" {
		t.Fatalf("refresh action = %q, want %q", refreshPayload.Data.Result.Action, "refresh_repo")
	}
	if refreshPayload.Data.RepositoryCard == nil {
		t.Fatal("expected repository card in refresh payload")
	}

	patternsResp := performJSONRequest(
		t,
		srv,
		http.MethodPost,
		"/api/repositories/"+repo.ID.String()+"/patterns",
		map[string]any{
			"include_patterns": []string{"cmd/**"},
			"exclude_patterns": []string{".git/**"},
		},
	)
	defer closeResponseBody(t, patternsResp.Body)
	if patternsResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/{id}/patterns status = %d, want 200", patternsResp.StatusCode)
	}
	var patternsPayload models.ActionResponse
	decodeJSONResponse(t, patternsResp, &patternsPayload)
	if patternsPayload.Data.Result.Action != "save_repo_patterns" {
		t.Fatalf("patterns action = %q, want %q", patternsPayload.Data.Result.Action, "save_repo_patterns")
	}

	toggleResp := performJSONRequest(t, srv, http.MethodPost, "/api/repositories/"+repo.ID.String()+"/toggle", nil)
	defer closeResponseBody(t, toggleResp.Body)
	if toggleResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/{id}/toggle status = %d, want 200", toggleResp.StatusCode)
	}
	var togglePayload models.ActionResponse
	decodeJSONResponse(t, toggleResp, &togglePayload)
	if togglePayload.Data.Result.Action != "toggle_repo" {
		t.Fatalf("toggle action = %q, want %q", togglePayload.Data.Result.Action, "toggle_repo")
	}
	if togglePayload.Data.Repository == nil || togglePayload.Data.Repository.State != models.StateDisabled {
		t.Fatal("expected disabled repository after first toggle")
	}

	// Toggle back to active so repository-wide actions still run.
	secondToggleResp := performJSONRequest(t, srv, http.MethodPost, "/api/repositories/"+repo.ID.String()+"/toggle", nil)
	defer closeResponseBody(t, secondToggleResp.Body)
	if secondToggleResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/{id}/toggle second status = %d, want 200", secondToggleResp.StatusCode)
	}

	importRepoResp := performJSONRequest(
		t,
		srv,
		http.MethodPost,
		"/api/repositories/"+repo.ID.String()+"/import",
		map[string]any{"days": 30},
	)
	defer closeResponseBody(t, importRepoResp.Body)
	if importRepoResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/{id}/import status = %d, want 200", importRepoResp.StatusCode)
	}
	var importRepoPayload models.ActionResponse
	decodeJSONResponse(t, importRepoResp, &importRepoPayload)
	if importRepoPayload.Data.Result.Action != "import_repo" {
		t.Fatalf("repo import action = %q, want %q", importRepoPayload.Data.Result.Action, "import_repo")
	}

	importAllResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/import", map[string]any{"days": 30})
	defer closeResponseBody(t, importAllResp.Body)
	if importAllResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/import status = %d, want 200", importAllResp.StatusCode)
	}
	var importAllPayload models.ActionResponse
	decodeJSONResponse(t, importAllResp, &importAllPayload)
	if importAllPayload.Data.Result.Action != "import_all" {
		t.Fatalf("import all action = %q, want %q", importAllPayload.Data.Result.Action, "import_all")
	}

	if err := os.WriteFile(
		filepath.Join(repoDir, "README.md"),
		[]byte("# Contract Repo\n\nChanged after import.\n"),
		0o644,
	); err != nil {
		t.Fatalf("mutate repo for rescan: %v", err)
	}

	rescanResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/rescan", nil)
	defer closeResponseBody(t, rescanResp.Body)
	if rescanResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/rescan status = %d, want 200", rescanResp.StatusCode)
	}
	var rescanPayload models.ActionResponse
	decodeJSONResponse(t, rescanResp, &rescanPayload)
	if rescanPayload.Data.Result.Action != "rescan_all" {
		t.Fatalf("rescan action = %q, want %q", rescanPayload.Data.Result.Action, "rescan_all")
	}

	rebuildResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/rebuild", nil)
	defer closeResponseBody(t, rebuildResp.Body)
	if rebuildResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/rebuild status = %d, want 200", rebuildResp.StatusCode)
	}
	var rebuildPayload models.ActionResponse
	decodeJSONResponse(t, rebuildResp, &rebuildPayload)
	if rebuildPayload.Data.Result.Action != "rebuild_analytics" {
		t.Fatalf("rebuild action = %q, want %q", rebuildPayload.Data.Result.Action, "rebuild_analytics")
	}

	removeResp := performJSONRequest(t, srv, http.MethodPost, "/api/repositories/"+repo.ID.String()+"/remove", nil)
	defer closeResponseBody(t, removeResp.Body)
	if removeResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/{id}/remove status = %d, want 200", removeResp.StatusCode)
	}
	var removePayload models.ActionResponse
	decodeJSONResponse(t, removeResp, &removePayload)
	if removePayload.Data.Result.Action != "remove_repo" {
		t.Fatalf("remove action = %q, want %q", removePayload.Data.Result.Action, "remove_repo")
	}
	if removePayload.Data.Repository == nil || removePayload.Data.Repository.State != models.StateRemoved {
		t.Fatal("expected removed repository state in remove payload")
	}
}

func prepareWorkflowServer(t *testing.T) (*Server, models.Repository, string) {
	t.Helper()

	repoDir := seedContractRepo(t)
	rt := newTestRuntime(t)
	t.Cleanup(func() { rt.Close() })

	srv := New(rt, "", nil)
	repo := addRepositoryViaAPI(t, srv, repoDir)

	importResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/import", map[string]any{"days": 30})
	defer closeResponseBody(t, importResp.Body)
	if importResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/import status = %d, want 200", importResp.StatusCode)
	}

	if err := os.WriteFile(
		filepath.Join(repoDir, "README.md"),
		[]byte("# Contract Repo\n\nChanged after import.\n"),
		0o644,
	); err != nil {
		t.Fatalf("mutate repo for workflow setup: %v", err)
	}

	rescanResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/rescan", nil)
	defer closeResponseBody(t, rescanResp.Body)
	if rescanResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/rescan status = %d, want 200", rescanResp.StatusCode)
	}

	rebuildResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/rebuild", nil)
	defer closeResponseBody(t, rebuildResp.Body)
	if rebuildResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/rebuild status = %d, want 200", rebuildResp.StatusCode)
	}

	return srv, repo, repoDir
}

func addRepositoryViaAPI(t *testing.T, srv *Server, repoDir string) models.Repository {
	t.Helper()

	resp := performJSONRequest(t, srv, http.MethodPost, "/api/repositories/add", map[string]any{"path": repoDir})
	defer closeResponseBody(t, resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/add status = %d, want 200", resp.StatusCode)
	}

	var payload models.ActionResponse
	decodeJSONResponse(t, resp, &payload)
	if payload.Data.Result.Action != "add_target" {
		t.Fatalf("add action = %q, want %q", payload.Data.Result.Action, "add_target")
	}
	if len(payload.Data.Repositories) != 1 {
		t.Fatalf("added repositories = %d, want 1", len(payload.Data.Repositories))
	}
	return payload.Data.Repositories[0]
}

func performJSONRequest(t *testing.T, handler http.Handler, method string, path string, payload any) *http.Response {
	t.Helper()

	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(data)
	}

	req := httptest.NewRequest(method, path, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder.Result()
}

func decodeJSONResponse(t *testing.T, resp *http.Response, target any) {
	t.Helper()

	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func closeResponseBody(t *testing.T, body io.Closer) {
	t.Helper()
	if err := body.Close(); err != nil {
		t.Fatalf("close response body: %v", err)
	}
}

func seedContractRepo(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	runGit := func(env []string, args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), env...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	baseEnv := []string{
		"GIT_AUTHOR_NAME=Contract Tester",
		"GIT_AUTHOR_EMAIL=contract@example.com",
		"GIT_COMMITTER_NAME=Contract Tester",
		"GIT_COMMITTER_EMAIL=contract@example.com",
	}

	runGit(baseEnv, "init", "-b", "main")
	runGit(baseEnv, "config", "user.email", "contract@example.com")
	runGit(baseEnv, "config", "user.name", "Contract Tester")

	files := []struct {
		name    string
		content string
		message string
		daysAgo int
	}{
		{"main.go", "package main\n\nfunc main() {}\n", "initial commit", 2},
		{"README.md", "# Contract Repo\n\nStable fixture.\n", "add readme", 1},
	}

	for _, file := range files {
		path := filepath.Join(dir, file.name)
		if err := os.WriteFile(path, []byte(file.content), 0o644); err != nil {
			t.Fatalf("write fixture file %s: %v", file.name, err)
		}
		runGit(baseEnv, "add", file.name)

		date := time.Now().UTC().AddDate(0, 0, -file.daysAgo).Format(time.RFC3339)
		env := append(baseEnv,
			fmt.Sprintf("GIT_AUTHOR_DATE=%s", date),
			fmt.Sprintf("GIT_COMMITTER_DATE=%s", date),
		)
		runGit(env, "commit", "-m", file.message, "--date", date)
	}

	return dir
}
