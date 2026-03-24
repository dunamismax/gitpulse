package runtime_test

import (
	"context"
	"encoding/json"
	"fmt"
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

// TestSmokeOperatorLoop exercises the full add → import → rescan →
// rebuild-rollups → dashboard API flow against a seeded temporary git
// repository.
//
// This is the "Workstream 1" smoke path from BUILD.md: prove that a fresh
// operator can add repos, import history, rescan, rebuild analytics, and
// inspect results without undocumented handholding.
func TestSmokeOperatorLoop(t *testing.T) {
	if testing.Short() {
		t.Skip("smoke test requires git; skipping in short mode")
	}

	ctx := context.Background()
	repoDir := seedRepo(t)

	// ---------------------------------------------------------------
	// 1. Boot runtime with a fresh temp database.
	// ---------------------------------------------------------------
	rt, _ := newTestRuntime(t)

	// ---------------------------------------------------------------
	// 2. Add the seeded repo.
	// ---------------------------------------------------------------
	added, err := rt.AddTarget(ctx, repoDir)
	if err != nil {
		t.Fatalf("AddTarget: %v", err)
	}
	if len(added) != 1 {
		t.Fatalf("AddTarget returned %d repos, want 1", len(added))
	}
	repo := added[0]
	if repo.State != models.StateActive {
		t.Fatalf("repo state = %q, want %q", repo.State, models.StateActive)
	}
	if repo.Name == "" {
		t.Fatal("repo name is empty")
	}

	t.Logf("Added repo: %s (id=%s)", repo.Name, repo.ID)

	// ---------------------------------------------------------------
	// 3. Verify repo appears in ListRepos.
	// ---------------------------------------------------------------
	repos, err := rt.ListRepos(ctx)
	if err != nil {
		t.Fatalf("ListRepos: %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("ListRepos returned %d repos, want 1", len(repos))
	}

	// ---------------------------------------------------------------
	// 4. Verify commits were imported (AddTarget auto-imports).
	// ---------------------------------------------------------------
	commits, err := db.ListCommits(ctx, rt.DB(), &repo.ID, 100)
	if err != nil {
		t.Fatalf("ListCommits: %v", err)
	}
	if len(commits) < 4 {
		t.Fatalf("expected >= 4 commits, got %d", len(commits))
	}
	t.Logf("Commits imported: %d", len(commits))

	// ---------------------------------------------------------------
	// 5. Explicit import (should be idempotent — no new rows).
	// ---------------------------------------------------------------
	n, err := rt.ImportRepoHistory(ctx, repo.ID, 30)
	if err != nil {
		t.Fatalf("ImportRepoHistory: %v", err)
	}
	t.Logf("Re-import inserted %d new commits (expected 0)", n)

	// ---------------------------------------------------------------
	// 6. Rescan all repositories.
	// ---------------------------------------------------------------
	if err := rt.RescanAll(ctx); err != nil {
		t.Fatalf("RescanAll: %v", err)
	}

	// Verify a snapshot was written.
	snap, err := db.LatestSnapshot(ctx, rt.DB(), repo.ID)
	if err != nil {
		t.Fatalf("LatestSnapshot: %v", err)
	}
	if snap == nil {
		t.Fatal("no snapshot after rescan")
	}
	t.Logf("Latest snapshot: branch=%v, head=%v", ptrStr(snap.Branch), ptrStr(snap.HeadSHA))

	// ---------------------------------------------------------------
	// 7. Rebuild analytics.
	// ---------------------------------------------------------------
	report, err := rt.RebuildAnalytics(ctx)
	if err != nil {
		t.Fatalf("RebuildAnalytics: %v", err)
	}
	t.Logf("Rebuild: sessions=%d, rollups=%d, achievements=%d, elapsed=%s",
		report.SessionsWritten, report.RollupsWritten, report.AchievementsWritten, report.Elapsed)

	// There should be at least one rollup for the "all" scope.
	allRollups, err := db.AllRollupsForScope(ctx, rt.DB(), "all")
	if err != nil {
		t.Fatalf("AllRollupsForScope: %v", err)
	}
	if len(allRollups) == 0 {
		t.Fatal("no rollups for scope 'all' after rebuild")
	}

	// Verify committed additions are non-zero somewhere.
	var totalCommittedAdd int
	for _, r := range allRollups {
		totalCommittedAdd += r.CommittedAdditions
	}
	if totalCommittedAdd == 0 {
		t.Fatal("committed additions across all rollups is 0; expected real data from imported commits")
	}
	t.Logf("Rollup days: %d, total committed additions: %d", len(allRollups), totalCommittedAdd)

	// Verify per-repo rollups exist.
	repoRollups, err := db.AllRollupsForScope(ctx, rt.DB(), repo.ID.String())
	if err != nil {
		t.Fatalf("AllRollupsForScope(repo): %v", err)
	}
	if len(repoRollups) == 0 {
		t.Fatal("no per-repo rollups after rebuild")
	}

	// ---------------------------------------------------------------
	// 8. Verify achievements exist.
	// ---------------------------------------------------------------
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
	// 9. Verify DashboardView returns populated data.
	// ---------------------------------------------------------------
	dash, err := rt.DashboardView(ctx)
	if err != nil {
		t.Fatalf("DashboardView: %v", err)
	}
	if len(dash.RepoCards) != 1 {
		t.Fatalf("DashboardView repo cards = %d, want 1", len(dash.RepoCards))
	}

	// ---------------------------------------------------------------
	// 10. Verify SessionsSummary returns data.
	// ---------------------------------------------------------------
	sessSummary, err := rt.SessionsSummary(ctx)
	if err != nil {
		t.Fatalf("SessionsSummary: %v", err)
	}
	t.Logf("Sessions: %d total, %d total minutes", len(sessSummary.Sessions), sessSummary.TotalMinutes)

	// ---------------------------------------------------------------
	// 11. Verify RepoDetail returns data.
	// ---------------------------------------------------------------
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

	// ---------------------------------------------------------------
	// 12. Verify AchievementsView returns data.
	// ---------------------------------------------------------------
	achList, streaks, score, err := rt.AchievementsView(ctx)
	if err != nil {
		t.Fatalf("AchievementsView: %v", err)
	}
	t.Logf("AchievementsView: %d achievements, streak=%d, score=%d", len(achList), streaks.CurrentDays, score)

	// ---------------------------------------------------------------
	// 13. Stand up HTTP server and hit /api/dashboard.
	// ---------------------------------------------------------------
	spaDir := createMinimalSPA(t)
	srv, err := web.New(rt, "", spaDir)
	if err != nil {
		t.Fatalf("web.New: %v", err)
	}

	ts := httptest.NewServer(srv)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/dashboard")
	if err != nil {
		t.Fatalf("GET /api/dashboard: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/dashboard status = %d, want 200", resp.StatusCode)
	}

	var dashJSON models.DashboardView
	if err := json.NewDecoder(resp.Body).Decode(&dashJSON); err != nil {
		t.Fatalf("decode dashboard JSON: %v", err)
	}
	if len(dashJSON.RepoCards) != 1 {
		t.Fatalf("dashboard JSON repo cards = %d, want 1", len(dashJSON.RepoCards))
	}
	t.Logf("API /api/dashboard: repo_cards=%d, commits_today=%d, streak=%d",
		len(dashJSON.RepoCards), dashJSON.Summary.CommitsToday, dashJSON.Summary.StreakDays)

	// Verify /api/repositories returns data.
	resp2, err := http.Get(ts.URL + "/api/repositories")
	if err != nil {
		t.Fatalf("GET /api/repositories: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/repositories status = %d", resp2.StatusCode)
	}

	// Verify /api/sessions returns data.
	resp3, err := http.Get(ts.URL + "/api/sessions")
	if err != nil {
		t.Fatalf("GET /api/sessions: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/sessions status = %d", resp3.StatusCode)
	}

	// Verify /api/achievements returns data.
	resp4, err := http.Get(ts.URL + "/api/achievements")
	if err != nil {
		t.Fatalf("GET /api/achievements: %v", err)
	}
	defer resp4.Body.Close()
	if resp4.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/achievements status = %d", resp4.StatusCode)
	}

	// Verify /api/repositories/{id} returns detail.
	resp5, err := http.Get(ts.URL + "/api/repositories/" + repo.ID.String())
	if err != nil {
		t.Fatalf("GET /api/repositories/{id}: %v", err)
	}
	defer resp5.Body.Close()
	if resp5.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/repositories/{id} status = %d", resp5.StatusCode)
	}

	t.Log("✓ Full operator smoke loop passed")
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

	commits1, err := db.ListCommits(ctx, rt.DB(), &repoID, 100)
	if err != nil {
		t.Fatalf("ListCommits: %v", err)
	}
	count1 := len(commits1)

	// Import again.
	_, err = rt.ImportRepoHistory(ctx, repoID, 30)
	if err != nil {
		t.Fatalf("ImportRepoHistory: %v", err)
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
// produces the same result.
func TestSmokeRebuildDeterminism(t *testing.T) {
	if testing.Short() {
		t.Skip("smoke test requires git; skipping in short mode")
	}

	ctx := context.Background()
	repoDir := seedRepo(t)
	rt, _ := newTestRuntime(t)

	_, err := rt.AddTarget(ctx, repoDir)
	if err != nil {
		t.Fatalf("AddTarget: %v", err)
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
	t.Logf("✓ Rebuild determinism: rollups=%d, achievements=%d (stable across 2 runs)",
		report1.RollupsWritten, report1.AchievementsWritten)
}

// createMinimalSPA creates a temp directory with a minimal index.html to
// satisfy the web.New() SPA directory requirement.
func createMinimalSPA(t *testing.T) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "web", "dist")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create SPA dir: %v", err)
	}
	indexPath := filepath.Join(dir, "index.html")
	if err := os.WriteFile(indexPath, []byte("<!DOCTYPE html><html><body>test</body></html>"), 0o644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}
	return dir
}

// ptrStr dereferences a *string for logging; returns "<nil>" if nil.
func ptrStr(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}
