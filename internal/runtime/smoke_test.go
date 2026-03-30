package runtime_test

import (
	"bytes"
	"context"
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

	"github.com/dunamismax/gitpulse/internal/config"
	"github.com/dunamismax/gitpulse/internal/db"
	"github.com/dunamismax/gitpulse/internal/models"
	"github.com/dunamismax/gitpulse/internal/runtime"
	"github.com/dunamismax/gitpulse/internal/web"
)

// seedRepo creates a temporary git repository with a known set of commits.
// It returns the path to the repo root. The commits are authored at staggered
// times across the last few days so that imports and rollups have real data.
func seedRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	gitCmd := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test Author",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test Author",
			"GIT_COMMITTER_EMAIL=test@example.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	gitCmd("init", "-b", "main")
	gitCmd("config", "user.email", "test@example.com")
	gitCmd("config", "user.name", "Test Author")

	// Create a few commits spread across recent days.
	files := []struct {
		name    string
		content string
		message string
		daysAgo int
	}{
		{"main.go", "package main\n\nfunc main() {\n\tprintln(\"hello\")\n}\n", "initial commit", 3},
		{"lib.go", "package main\n\nfunc add(a, b int) int {\n\treturn a + b\n}\n", "add lib", 2},
		{"lib_test.go", "package main\n\nimport \"testing\"\n\nfunc TestAdd(t *testing.T) {\n\tif add(1, 2) != 3 {\n\t\tt.Fatal(\"bad\")\n\t}\n}\n", "add tests", 1},
		{"README.md", "# Test Repo\n\nThis is a test.\n", "add readme", 0},
	}

	for _, f := range files {
		path := filepath.Join(dir, f.name)
		if err := os.WriteFile(path, []byte(f.content), 0o644); err != nil {
			t.Fatalf("write %s: %v", f.name, err)
		}
		gitCmd("add", f.name)

		// Set author date to stagger commits across days.
		date := time.Now().UTC().AddDate(0, 0, -f.daysAgo).Format(time.RFC3339)
		cmd := exec.Command("git", "commit", "-m", f.message, "--date", date)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test Author",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test Author",
			"GIT_COMMITTER_EMAIL=test@example.com",
			fmt.Sprintf("GIT_AUTHOR_DATE=%s", date),
			fmt.Sprintf("GIT_COMMITTER_DATE=%s", date),
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git commit %q: %v\n%s", f.message, err, out)
		}
	}

	return dir
}

// newTestRuntime creates a runtime pointed at a temp database with defaults.
func newTestRuntime(t *testing.T) (*runtime.Runtime, *config.AppConfig) {
	t.Helper()
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "gitpulse-smoke.db")
	cfg := &config.AppConfig{
		Database: config.DatabaseSettings{Path: dbPath},
		Monitoring: config.MonitoringSettings{
			ImportDays:         30,
			SessionGapMinutes:  15,
			RepoDiscoveryDepth: 5,
		},
		Server: config.ServerSettings{Host: "127.0.0.1", Port: 0},
		Goals: config.GoalSettings{
			ChangedLinesPerDay: 250,
			CommitsPerDay:      3,
			FocusMinutesPerDay: 90,
		},
		UI: config.UISettings{Timezone: "UTC"},
	}

	rt, err := runtime.New(ctx, cfg)
	if err != nil {
		t.Fatalf("runtime.New: %v", err)
	}
	t.Cleanup(func() { rt.Close() })

	return rt, cfg
}

func closeTestBody(t *testing.T, body io.Closer) {
	t.Helper()
	if err := body.Close(); err != nil {
		t.Errorf("close response body: %v", err)
	}
}

// TestSmokeOperatorLoop exercises the documented manual-first operator loop
// through the public JSON API: add → import → rescan → rebuild → inspect.
//
// This verifies the now-canonical product shape: adding a repo only registers
// it, rescans only refresh live state, and rebuilds stay explicit before
// derived analytics appear.
func TestSmokeOperatorLoop(t *testing.T) {
	if testing.Short() {
		t.Skip("smoke test requires git; skipping in short mode")
	}

	ctx := context.Background()
	repoDir := seedRepo(t)
	rt, _ := newTestRuntime(t)
	srv := web.New(rt, "", nil)

	// ---------------------------------------------------------------
	// 1. Add the seeded repo through the public API.
	// ---------------------------------------------------------------
	resp := performJSONRequest(t, srv, http.MethodPost, "/api/repositories/add", map[string]any{
		"path": repoDir,
	})
	defer closeTestBody(t, resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/repositories/add status = %d, want 200", resp.StatusCode)
	}

	var addPayload models.ActionResponse
	if err := json.NewDecoder(resp.Body).Decode(&addPayload); err != nil {
		t.Fatalf("decode add response: %v", err)
	}
	if addPayload.Data.Result.Action != "add_target" {
		t.Fatalf("add action = %q, want %q", addPayload.Data.Result.Action, "add_target")
	}
	if len(addPayload.Data.Repositories) != 1 {
		t.Fatalf("added repos = %d, want 1", len(addPayload.Data.Repositories))
	}
	if addPayload.Data.Repositories[0].State != models.StateActive {
		t.Fatalf("repo state = %q, want %q", addPayload.Data.Repositories[0].State, models.StateActive)
	}
	repo := addPayload.Data.Repositories[0]
	if repo.Name == "" {
		t.Fatal("repo name is empty")
	}
	t.Logf("Added repo: %s (id=%s)", repo.Name, repo.ID)

	// Add now only registers the repo. No commits or rollups should exist yet.
	repos, err := rt.ListRepos(ctx)
	if err != nil {
		t.Fatalf("ListRepos: %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("ListRepos returned %d repos, want 1", len(repos))
	}

	commits, err := db.ListCommits(ctx, rt.DB(), &repo.ID, 100)
	if err != nil {
		t.Fatalf("ListCommits after add: %v", err)
	}
	if len(commits) != 0 {
		t.Fatalf("commits after add = %d, want 0", len(commits))
	}

	allRollups, err := db.AllRollupsForScope(ctx, rt.DB(), "all")
	if err != nil {
		t.Fatalf("AllRollupsForScope after add: %v", err)
	}
	if len(allRollups) != 0 {
		t.Fatalf("rollups after add = %d, want 0", len(allRollups))
	}

	// ---------------------------------------------------------------
	// 2. Import history explicitly.
	// ---------------------------------------------------------------
	importResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/import", map[string]any{
		"days": 30,
	})
	defer closeTestBody(t, importResp.Body)
	if importResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/import status = %d, want 200", importResp.StatusCode)
	}

	var importResult models.ActionResponse
	if err := json.NewDecoder(importResp.Body).Decode(&importResult); err != nil {
		t.Fatalf("decode import response: %v", err)
	}
	if importResult.Data.Result.Action != "import_all" {
		t.Fatalf("import action = %q, want %q", importResult.Data.Result.Action, "import_all")
	}

	commitsAfterImport, err := db.ListCommits(ctx, rt.DB(), &repo.ID, 100)
	if err != nil {
		t.Fatalf("ListCommits after import: %v", err)
	}
	if len(commitsAfterImport) < 4 {
		t.Fatalf("commits after import = %d, want >= 4", len(commitsAfterImport))
	}
	t.Logf("Commits imported: %d", len(commitsAfterImport))

	allRollups, err = db.AllRollupsForScope(ctx, rt.DB(), "all")
	if err != nil {
		t.Fatalf("AllRollupsForScope after import: %v", err)
	}
	if len(allRollups) != 0 {
		t.Fatalf("rollups after import = %d, want 0 until rebuild", len(allRollups))
	}

	// ---------------------------------------------------------------
	// 3. Make a live working-tree change and rescan explicitly.
	// ---------------------------------------------------------------
	if err := os.WriteFile(filepath.Join(repoDir, "README.md"), []byte("# Test Repo\n\nThis changed after import.\n"), 0o644); err != nil {
		t.Fatalf("mutate README.md: %v", err)
	}

	rescanResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/rescan", nil)
	defer closeTestBody(t, rescanResp.Body)
	if rescanResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/rescan status = %d, want 200", rescanResp.StatusCode)
	}

	var rescanResult models.ActionResponse
	if err := json.NewDecoder(rescanResp.Body).Decode(&rescanResult); err != nil {
		t.Fatalf("decode rescan response: %v", err)
	}
	if rescanResult.Data.Result.Action != "rescan_all" {
		t.Fatalf("rescan action = %q, want %q", rescanResult.Data.Result.Action, "rescan_all")
	}

	snap, err := db.LatestSnapshot(ctx, rt.DB(), repo.ID)
	if err != nil {
		t.Fatalf("LatestSnapshot: %v", err)
	}
	if snap == nil {
		t.Fatal("no snapshot after rescan")
	}
	if snap.LiveAdditions+snap.LiveDeletions == 0 {
		t.Fatalf("snapshot live delta = %d, want non-zero after working-tree change", snap.LiveAdditions+snap.LiveDeletions)
	}
	t.Logf("Latest snapshot: branch=%v, head=%v, live_delta=%d", ptrStr(snap.Branch), ptrStr(snap.HeadSHA), snap.LiveAdditions+snap.LiveDeletions)

	commitsAfterRescan, err := db.ListCommits(ctx, rt.DB(), &repo.ID, 100)
	if err != nil {
		t.Fatalf("ListCommits after rescan: %v", err)
	}
	if len(commitsAfterRescan) != len(commitsAfterImport) {
		t.Fatalf("commits changed during rescan: %d -> %d", len(commitsAfterImport), len(commitsAfterRescan))
	}

	allRollups, err = db.AllRollupsForScope(ctx, rt.DB(), "all")
	if err != nil {
		t.Fatalf("AllRollupsForScope after rescan: %v", err)
	}
	if len(allRollups) != 0 {
		t.Fatalf("rollups after rescan = %d, want 0 until rebuild", len(allRollups))
	}

	// ---------------------------------------------------------------
	// 4. Rebuild analytics explicitly.
	// ---------------------------------------------------------------
	rebuildResp := performJSONRequest(t, srv, http.MethodPost, "/api/actions/rebuild", nil)
	defer closeTestBody(t, rebuildResp.Body)
	if rebuildResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/actions/rebuild status = %d, want 200", rebuildResp.StatusCode)
	}

	var rebuildResult models.ActionResponse
	if err := json.NewDecoder(rebuildResp.Body).Decode(&rebuildResult); err != nil {
		t.Fatalf("decode rebuild response: %v", err)
	}
	if rebuildResult.Data.Result.Action != "rebuild_analytics" {
		t.Fatalf("rebuild action = %q, want %q", rebuildResult.Data.Result.Action, "rebuild_analytics")
	}

	allRollups, err = db.AllRollupsForScope(ctx, rt.DB(), "all")
	if err != nil {
		t.Fatalf("AllRollupsForScope after rebuild: %v", err)
	}
	if len(allRollups) == 0 {
		t.Fatal("no rollups for scope 'all' after rebuild")
	}

	var totalCommittedAdd int
	for _, r := range allRollups {
		totalCommittedAdd += r.CommittedAdditions
	}
	if totalCommittedAdd == 0 {
		t.Fatal("committed additions across all rollups is 0; expected real data from imported commits")
	}
	t.Logf("Rollup days: %d, total committed additions: %d", len(allRollups), totalCommittedAdd)

	repoRollups, err := db.AllRollupsForScope(ctx, rt.DB(), repo.ID.String())
	if err != nil {
		t.Fatalf("AllRollupsForScope(repo): %v", err)
	}
	if len(repoRollups) == 0 {
		t.Fatal("no per-repo rollups after rebuild")
	}

	achs, err := db.ListAchievements(ctx, rt.DB())
	if err != nil {
		t.Fatalf("ListAchievements: %v", err)
	}
	if len(achs) == 0 {
		t.Fatal("no achievements after rebuild with imported data")
	}
	for _, a := range achs {
		t.Logf("Achievement: %s — %s", a.Kind, a.Reason)
	}

	// ---------------------------------------------------------------
	// 5. Inspect the resulting API and view models.
	// ---------------------------------------------------------------
	dash, err := rt.DashboardView(ctx)
	if err != nil {
		t.Fatalf("DashboardView: %v", err)
	}
	if len(dash.RepoCards) != 1 {
		t.Fatalf("DashboardView repo cards = %d, want 1", len(dash.RepoCards))
	}

	sessSummary, err := rt.SessionsSummary(ctx)
	if err != nil {
		t.Fatalf("SessionsSummary: %v", err)
	}
	t.Logf("Sessions: %d total, %d total minutes", len(sessSummary.Sessions), sessSummary.TotalMinutes)

	detail, err := rt.RepoDetail(ctx, repo.ID.String())
	if err != nil {
		t.Fatalf("RepoDetail: %v", err)
	}
	if detail.Card.Repo.ID != repo.ID {
		t.Fatalf("RepoDetail card repo ID mismatch")
	}
	if len(detail.RecentCommits) == 0 {
		t.Fatal("RepoDetail has no recent commits")
	}

	achView, err := rt.AchievementsView(ctx)
	if err != nil {
		t.Fatalf("AchievementsView: %v", err)
	}
	t.Logf("AchievementsView: %d achievements, streak=%d, score=%d", len(achView.Achievements), achView.Streaks.CurrentDays, achView.TodayScore)

	dashboardResp := performRequest(t, srv, http.MethodGet, "/api/dashboard")
	defer closeTestBody(t, dashboardResp.Body)
	if dashboardResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/dashboard status = %d, want 200", dashboardResp.StatusCode)
	}

	var dashJSON models.DashboardResponse
	if err := json.NewDecoder(dashboardResp.Body).Decode(&dashJSON); err != nil {
		t.Fatalf("decode dashboard JSON: %v", err)
	}
	if len(dashJSON.Data.RepoCards) != 1 {
		t.Fatalf("dashboard JSON repo cards = %d, want 1", len(dashJSON.Data.RepoCards))
	}
	t.Logf("API /api/dashboard: repo_cards=%d, commits_today=%d, streak=%d", len(dashJSON.Data.RepoCards), dashJSON.Data.Summary.CommitsToday, dashJSON.Data.Summary.StreakDays)

	reposResp := performRequest(t, srv, http.MethodGet, "/api/repositories")
	defer closeTestBody(t, reposResp.Body)
	if reposResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/repositories status = %d", reposResp.StatusCode)
	}

	sessionsResp := performRequest(t, srv, http.MethodGet, "/api/sessions")
	defer closeTestBody(t, sessionsResp.Body)
	if sessionsResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/sessions status = %d", sessionsResp.StatusCode)
	}

	achievementsResp := performRequest(t, srv, http.MethodGet, "/api/achievements")
	defer closeTestBody(t, achievementsResp.Body)
	if achievementsResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/achievements status = %d", achievementsResp.StatusCode)
	}

	detailResp := performRequest(t, srv, http.MethodGet, "/api/repositories/"+repo.ID.String())
	defer closeTestBody(t, detailResp.Body)
	if detailResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/repositories/{id} status = %d", detailResp.StatusCode)
	}

	t.Log("✓ Full manual-first operator smoke loop passed")
}

func performRequest(t *testing.T, handler http.Handler, method string, path string) *http.Response {
	t.Helper()

	req := httptest.NewRequest(method, path, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder.Result()
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

// TestSmokeImportIdempotency verifies that re-importing the same commits
// does not produce duplicates.
func TestSmokeImportIdempotency(t *testing.T) {
	if testing.Short() {
		t.Skip("smoke test requires git; skipping in short mode")
	}

	ctx := context.Background()
	repoDir := seedRepo(t)
	rt, _ := newTestRuntime(t)

	added, err := rt.AddTarget(ctx, repoDir)
	if err != nil {
		t.Fatalf("AddTarget: %v", err)
	}
	repoID := added[0].ID

	if _, err := rt.ImportRepoHistory(ctx, repoID, 30); err != nil {
		t.Fatalf("ImportRepoHistory 1: %v", err)
	}

	commits1, err := db.ListCommits(ctx, rt.DB(), &repoID, 100)
	if err != nil {
		t.Fatalf("ListCommits: %v", err)
	}
	count1 := len(commits1)

	if _, err := rt.ImportRepoHistory(ctx, repoID, 30); err != nil {
		t.Fatalf("ImportRepoHistory 2: %v", err)
	}

	commits2, err := db.ListCommits(ctx, rt.DB(), &repoID, 100)
	if err != nil {
		t.Fatalf("ListCommits: %v", err)
	}
	count2 := len(commits2)

	if count2 != count1 {
		t.Fatalf("commit count changed after re-import: %d → %d", count1, count2)
	}
	t.Logf("✓ Import idempotency: %d commits unchanged after re-import", count1)
}

// TestSmokeRebuildDeterminism verifies that rebuilding analytics twice
// produces the same result once raw history and snapshots exist.
func TestSmokeRebuildDeterminism(t *testing.T) {
	if testing.Short() {
		t.Skip("smoke test requires git; skipping in short mode")
	}

	ctx := context.Background()
	repoDir := seedRepo(t)
	rt, _ := newTestRuntime(t)

	added, err := rt.AddTarget(ctx, repoDir)
	if err != nil {
		t.Fatalf("AddTarget: %v", err)
	}
	repoID := added[0].ID

	if _, err := rt.ImportRepoHistory(ctx, repoID, 30); err != nil {
		t.Fatalf("ImportRepoHistory: %v", err)
	}
	if err := rt.RefreshRepository(ctx, repoID, true); err != nil {
		t.Fatalf("RefreshRepository: %v", err)
	}

	report1, err := rt.RebuildAnalytics(ctx)
	if err != nil {
		t.Fatalf("RebuildAnalytics 1: %v", err)
	}

	report2, err := rt.RebuildAnalytics(ctx)
	if err != nil {
		t.Fatalf("RebuildAnalytics 2: %v", err)
	}

	if report1.RollupsWritten != report2.RollupsWritten {
		t.Fatalf("rollups differ: %d vs %d", report1.RollupsWritten, report2.RollupsWritten)
	}
	if report1.AchievementsWritten != report2.AchievementsWritten {
		t.Fatalf("achievements differ: %d vs %d", report1.AchievementsWritten, report2.AchievementsWritten)
	}
	t.Logf("✓ Rebuild determinism: rollups=%d, achievements=%d (stable across 2 runs)", report1.RollupsWritten, report1.AchievementsWritten)
}

// ptrStr dereferences a *string for logging; returns "<nil>" if nil.
func ptrStr(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
