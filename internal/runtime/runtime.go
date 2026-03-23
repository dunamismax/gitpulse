// Package runtime orchestrates repositories, analytics, and view generation.
package runtime

import (
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/config"
	"github.com/dunamismax/gitpulse/internal/db"
	"github.com/dunamismax/gitpulse/internal/filter"
	gitpkg "github.com/dunamismax/gitpulse/internal/git"
	"github.com/dunamismax/gitpulse/internal/metrics"
	"github.com/dunamismax/gitpulse/internal/models"
	"github.com/dunamismax/gitpulse/internal/sessions"
)

// Runtime wires together all subsystems.
type Runtime struct {
	cfgMu sync.RWMutex
	cfg   *config.AppConfig
	pool  *pgxpool.Pool
}

// New connects to the database, runs migrations, and returns a Runtime.
func New(ctx context.Context, cfg *config.AppConfig) (*Runtime, error) {
	if cfg.Database.DSN == "" {
		return nil, fmt.Errorf("database DSN is not configured (set database.dsn in config or GITPULSE_DATABASE__DSN env var)")
	}

	pool, err := db.Connect(ctx, cfg.Database.DSN)
	if err != nil {
		return nil, fmt.Errorf("db connect: %w", err)
	}

	if err := db.RunMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrations: %w", err)
	}

	return &Runtime{cfg: cfg.Clone(), pool: pool}, nil
}

// Close shuts down the database pool.
func (rt *Runtime) Close() {
	rt.pool.Close()
}

// Pool exposes the pgxpool for direct use in tests.
func (rt *Runtime) Pool() *pgxpool.Pool {
	return rt.pool
}

// Config returns the loaded configuration.
func (rt *Runtime) Config() *config.AppConfig {
	rt.cfgMu.RLock()
	defer rt.cfgMu.RUnlock()

	if rt.cfg == nil {
		return &config.AppConfig{}
	}
	return rt.cfg.Clone()
}

// SetConfig replaces the in-memory configuration snapshot.
func (rt *Runtime) SetConfig(cfg *config.AppConfig) {
	rt.cfgMu.Lock()
	defer rt.cfgMu.Unlock()

	rt.cfg = cfg.Clone()
}

// ---------------------------------------------------------------------------
// Repository management
// ---------------------------------------------------------------------------

// ListRepos returns all tracked repositories ordered by name.
func (rt *Runtime) ListRepos(ctx context.Context) ([]models.Repository, error) {
	return db.ListRepositories(ctx, rt.pool)
}

// FindRepo resolves a repository by UUID, exact path, or name prefix.
func (rt *Runtime) FindRepo(ctx context.Context, selector string) (*models.Repository, error) {
	return db.FindRepository(ctx, rt.pool, selector)
}

// AddTarget discovers repositories at path, registers them, imports initial
// history, and rebuilds analytics.
func (rt *Runtime) AddTarget(ctx context.Context, path string) ([]models.Repository, error) {
	cfg := rt.Config()

	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve path: %w", err)
	}

	roots, err := gitpkg.DiscoverRepositories(ctx, abs, cfg.Monitoring.RepoDiscoveryDepth)
	if err != nil {
		return nil, fmt.Errorf("discover repos: %w", err)
	}
	if len(roots) == 0 {
		return nil, fmt.Errorf("no git repositories found at %s", abs)
	}

	targetID := uuid.New()
	kind := "repo"
	if len(roots) > 1 {
		kind = "folder"
	}
	target := models.TrackedTarget{
		ID:        targetID,
		Path:      abs,
		Kind:      kind,
		CreatedAt: time.Now().UTC(),
	}
	if err := db.UpsertTrackedTarget(ctx, rt.pool, target); err != nil {
		return nil, fmt.Errorf("upsert target: %w", err)
	}

	var added []models.Repository
	for _, root := range roots {
		name, remoteURL, defaultBranch, _ := gitpkg.ProbeRepository(ctx, root)
		now := time.Now().UTC()
		repoID := uuid.New()

		repo := models.Repository{
			ID:              repoID,
			TargetID:        &targetID,
			Name:            name,
			RootPath:        root,
			IsMonitored:     true,
			State:           models.StateActive,
			CreatedAt:       now,
			UpdatedAt:       now,
			IncludePatterns: cfg.Patterns.Include,
			ExcludePatterns: cfg.Patterns.Exclude,
		}
		if remoteURL != "" {
			repo.RemoteURL = &remoteURL
		}
		if defaultBranch != "" {
			repo.DefaultBranch = &defaultBranch
		}

		if err := db.UpsertRepository(ctx, rt.pool, repo); err != nil {
			return nil, fmt.Errorf("upsert repo %s: %w", root, err)
		}

		// Reload to get the canonical ID in case of conflict.
		saved, err := db.FindRepository(ctx, rt.pool, root)
		if err != nil || saved == nil {
			continue
		}

		if _, err := rt.ImportRepoHistory(ctx, saved.ID, cfg.Monitoring.ImportDays); err != nil {
			// Non-fatal: continue even if import fails.
			_ = err
		}

		added = append(added, *saved)
	}

	if err := rt.rebuildAnalyticsInternal(ctx); err != nil {
		return added, fmt.Errorf("rebuild analytics: %w", err)
	}

	return added, nil
}

// RefreshRepository snapshots a repository, detects pushes, inserts activity,
// imports recent commits, and rebuilds analytics.
func (rt *Runtime) RefreshRepository(ctx context.Context, repoID uuid.UUID, includeSizeScan bool) error {
	repo, err := db.GetRepository(ctx, rt.pool, repoID)
	if err != nil || repo == nil {
		return fmt.Errorf("repo not found: %v", repoID)
	}

	f, err := rt.filterForRepo(repo)
	if err != nil {
		return err
	}

	snap, err := gitpkg.SnapshotRepository(ctx, repo.RootPath, f, includeSizeScan)
	if err != nil {
		return fmt.Errorf("snapshot %s: %w", repo.Name, err)
	}

	// Detect push: previous ahead_count > current ahead_count.
	prevSnap, _ := db.LatestSnapshot(ctx, rt.pool, repoID)
	if prevSnap != nil && prevSnap.AheadCount > snap.AheadCount {
		push := models.PushEvent{
			ID:                uuid.New(),
			RepoID:            repoID,
			ObservedAt:        time.Now().UTC(),
			Kind:              models.PushDetectedLocal,
			HeadSHA:           snap.HeadSHA,
			PushedCommitCount: prevSnap.AheadCount - snap.AheadCount,
			UpstreamRef:       snap.UpstreamRef,
		}
		_ = db.InsertPushEvent(ctx, rt.pool, push)
	}

	// Insert file activity if there are changes.
	now := time.Now().UTC()
	var fileEvents []models.FileActivityEvent
	for _, tp := range snap.TouchedPaths {
		fileEvents = append(fileEvents, models.FileActivityEvent{
			ID:           uuid.New(),
			RepoID:       repoID,
			ObservedAt:   now,
			RelativePath: tp.Path,
			Additions:    tp.Additions,
			Deletions:    tp.Deletions,
			Kind:         models.ActivityRefresh,
		})
	}
	if len(fileEvents) > 0 {
		_ = db.InsertFileActivity(ctx, rt.pool, fileEvents)
	}

	// Store snapshot.
	dbSnap := models.RepoStatusSnapshot{
		ID:                uuid.New(),
		RepoID:            repoID,
		ObservedAt:        now,
		Branch:            snap.Branch,
		IsDetached:        snap.IsDetached,
		HeadSHA:           snap.HeadSHA,
		UpstreamRef:       snap.UpstreamRef,
		UpstreamHeadSHA:   snap.UpstreamHeadSHA,
		AheadCount:        snap.AheadCount,
		BehindCount:       snap.BehindCount,
		LiveAdditions:     snap.LiveStats.Additions,
		LiveDeletions:     snap.LiveStats.Deletions,
		LiveFiles:         snap.LiveStats.FileCount,
		StagedAdditions:   snap.StagedStats.Additions,
		StagedDeletions:   snap.StagedStats.Deletions,
		StagedFiles:       snap.StagedStats.FileCount,
		FilesTouched:      len(snap.TouchedPaths),
		RepoSizeBytes:     snap.RepoSizeBytes,
		LanguageBreakdown: snap.LanguageBreakdown,
	}
	_ = db.InsertSnapshot(ctx, rt.pool, dbSnap)

	// Import recent history.
	if _, err := rt.ImportRepoHistory(ctx, repoID, 2); err != nil {
		_ = err // Non-fatal.
	}

	return rt.rebuildAnalyticsInternal(ctx)
}

// RescanAll refreshes all active monitored repositories.
func (rt *Runtime) RescanAll(ctx context.Context) error {
	repos, err := db.ListRepositories(ctx, rt.pool)
	if err != nil {
		return err
	}
	for _, r := range repos {
		if r.State != models.StateActive || !r.IsMonitored {
			continue
		}
		if err := rt.RefreshRepository(ctx, r.ID, false); err != nil {
			_ = err // Log and continue.
		}
	}
	return nil
}

// ImportRepoHistory imports commit history for a repository.
// Returns the number of commits inserted.
func (rt *Runtime) ImportRepoHistory(ctx context.Context, repoID uuid.UUID, days int) (int, error) {
	cfg := rt.Config()

	repo, err := db.GetRepository(ctx, rt.pool, repoID)
	if err != nil || repo == nil {
		return 0, fmt.Errorf("repo not found: %v", repoID)
	}

	f, err := rt.filterForRepo(repo)
	if err != nil {
		return 0, err
	}

	imported, err := gitpkg.ImportHistory(ctx, repoID, repo.RootPath, cfg.AuthorEmails(), days, f)
	if err != nil {
		return 0, fmt.Errorf("import history %s: %w", repo.Name, err)
	}

	var commits []models.CommitEvent
	var fileEvents []models.FileActivityEvent

	for _, ic := range imported {
		commits = append(commits, ic.Commit)
		for _, tp := range ic.TouchedPaths {
			fileEvents = append(fileEvents, models.FileActivityEvent{
				ID:           uuid.New(),
				RepoID:       repoID,
				ObservedAt:   ic.Commit.AuthoredAt,
				RelativePath: tp.Path,
				Additions:    tp.Additions,
				Deletions:    tp.Deletions,
				Kind:         models.ActivityImport,
			})
		}
	}

	n, err := db.InsertCommits(ctx, rt.pool, commits)
	if err != nil {
		return 0, err
	}
	_ = db.InsertFileActivity(ctx, rt.pool, fileEvents)

	return n, nil
}

// ToggleRepository flips a repository between Active and Disabled states.
func (rt *Runtime) ToggleRepository(ctx context.Context, repoID uuid.UUID) error {
	repo, err := db.GetRepository(ctx, rt.pool, repoID)
	if err != nil || repo == nil {
		return fmt.Errorf("repo not found: %v", repoID)
	}
	newState := models.StateActive
	monitored := true
	if repo.State == models.StateActive {
		newState = models.StateDisabled
		monitored = false
	}
	return db.SetRepositoryState(ctx, rt.pool, repoID, newState, monitored)
}

// RemoveRepository marks a repository as removed.
func (rt *Runtime) RemoveRepository(ctx context.Context, repoID uuid.UUID) error {
	return db.SetRepositoryState(ctx, rt.pool, repoID, models.StateRemoved, false)
}

// ---------------------------------------------------------------------------
// Analytics rebuild
// ---------------------------------------------------------------------------

// RebuildAnalytics performs a full recompute of sessions, rollups, and
// achievements and returns a report.
func (rt *Runtime) RebuildAnalytics(ctx context.Context) (*models.RebuildReport, error) {
	start := time.Now()
	if err := rt.rebuildAnalyticsInternal(ctx); err != nil {
		return nil, err
	}

	sess, err := db.ListFocusSessions(ctx, rt.pool, 9999)
	if err != nil {
		return nil, err
	}
	rollups, err := db.AllRollupsForScope(ctx, rt.pool, "all")
	if err != nil {
		return nil, err
	}
	achs, err := db.ListAchievements(ctx, rt.pool)
	if err != nil {
		return nil, err
	}

	return &models.RebuildReport{
		SessionsWritten:     len(sess),
		RollupsWritten:      len(rollups),
		AchievementsWritten: len(achs),
		Elapsed:             time.Since(start),
	}, nil
}

// rebuildAnalyticsInternal does the actual work without returning a report.
func (rt *Runtime) rebuildAnalyticsInternal(ctx context.Context) error {
	cfg := rt.Config()

	repos, err := db.ListRepositories(ctx, rt.pool)
	if err != nil {
		return err
	}
	repoMap := map[uuid.UUID]models.Repository{}
	for _, r := range repos {
		if r.State != models.StateRemoved {
			repoMap[r.ID] = r
		}
	}

	snapshots, err := db.AllSnapshotsForAnalytics(ctx, rt.pool)
	if err != nil {
		return err
	}
	commits, err := db.AllCommitsForAnalytics(ctx, rt.pool)
	if err != nil {
		return err
	}
	pushEvents, err := db.AllPushEventsForAnalytics(ctx, rt.pool)
	if err != nil {
		return err
	}
	fileActivity, err := db.AllFileActivityForAnalytics(ctx, rt.pool)
	if err != nil {
		return err
	}

	tz := loadTimezone(cfg.UI.Timezone)
	boundary := time.Duration(cfg.UI.DayBoundaryMinutes) * time.Minute

	// dayKey returns the calendar day string for a UTC timestamp respecting the
	// configured timezone and day boundary offset.
	dayKey := func(t time.Time) string {
		local := t.In(tz)
		// Subtract the boundary to shift the "start of day" forward.
		adjusted := local.Add(-boundary)
		return adjusted.Format("2006-01-02")
	}

	// Accumulator per (scope, day).
	type accumKey struct {
		scope string
		day   string
	}
	type acc struct {
		liveAdd, liveDel           int
		stagedAdd, stagedDel       int
		committedAdd, committedDel int
		commits, pushes            int
		files                      map[string]struct{}
		langs                      map[string]struct{}
	}
	newAcc := func() *acc {
		return &acc{
			files: map[string]struct{}{},
			langs: map[string]struct{}{},
		}
	}
	getOrNew := func(m map[accumKey]*acc, k accumKey) *acc {
		if v, ok := m[k]; ok {
			return v
		}
		v := newAcc()
		m[k] = v
		return v
	}

	accMap := map[accumKey]*acc{}

	// Process snapshots: live/staged lines, language breakdown.
	for _, s := range snapshots {
		if _, ok := repoMap[s.RepoID]; !ok {
			continue
		}
		day := dayKey(s.ObservedAt)
		repoKey := accumKey{scope: s.RepoID.String(), day: day}
		allKey := accumKey{scope: "all", day: day}

		for _, k := range []accumKey{repoKey, allKey} {
			a := getOrNew(accMap, k)
			// Latest snapshot per day wins for live/staged (overwrite).
			a.liveAdd = s.LiveAdditions
			a.liveDel = s.LiveDeletions
			a.stagedAdd = s.StagedAdditions
			a.stagedDel = s.StagedDeletions
			for _, lang := range s.LanguageBreakdown {
				a.langs[lang.Language] = struct{}{}
			}
		}
	}

	// Process commits: committed lines.
	for _, c := range commits {
		if _, ok := repoMap[c.RepoID]; !ok {
			continue
		}
		day := dayKey(c.AuthoredAt)
		for _, k := range []accumKey{
			{scope: c.RepoID.String(), day: day},
			{scope: "all", day: day},
		} {
			a := getOrNew(accMap, k)
			a.committedAdd += c.Additions
			a.committedDel += c.Deletions
			a.commits++
		}
	}

	// Process push events (local detection only).
	for _, p := range pushEvents {
		if _, ok := repoMap[p.RepoID]; !ok {
			continue
		}
		if p.Kind != models.PushDetectedLocal {
			continue
		}
		day := dayKey(p.ObservedAt)
		for _, k := range []accumKey{
			{scope: p.RepoID.String(), day: day},
			{scope: "all", day: day},
		} {
			a := getOrNew(accMap, k)
			a.pushes++
		}
	}

	// Process file activity: file sets.
	for _, e := range fileActivity {
		if _, ok := repoMap[e.RepoID]; !ok {
			continue
		}
		day := dayKey(e.ObservedAt)
		for _, k := range []accumKey{
			{scope: e.RepoID.String(), day: day},
			{scope: "all", day: day},
		} {
			a := getOrNew(accMap, k)
			a.files[e.RelativePath] = struct{}{}
		}
	}

	// Build activity points for session detection.
	var points []models.ActivityPoint
	for _, c := range commits {
		if _, ok := repoMap[c.RepoID]; !ok {
			continue
		}
		points = append(points, models.ActivityPoint{
			RepoID:       c.RepoID,
			ObservedAt:   c.AuthoredAt,
			Kind:         models.ActivityCommit,
			ChangedLines: c.Additions + c.Deletions,
		})
	}
	for _, e := range fileActivity {
		if _, ok := repoMap[e.RepoID]; !ok {
			continue
		}
		points = append(points, models.ActivityPoint{
			RepoID:       e.RepoID,
			ObservedAt:   e.ObservedAt,
			Kind:         e.Kind,
			ChangedLines: e.Additions + e.Deletions,
		})
	}

	focusSessions := sessions.Sessionize(points, cfg.Monitoring.SessionGapMinutes)

	// Distribute focus minutes back to daily accumulators.
	for _, s := range focusSessions {
		day := dayKey(s.StartedAt)
		for _, repoID := range s.RepoIDs {
			if _, ok := repoMap[repoID]; !ok {
				continue
			}
			k := accumKey{scope: repoID.String(), day: day}
			getOrNew(accMap, k).commits += 0 // ensure entry exists
		}
		allKey := accumKey{scope: "all", day: day}
		getOrNew(accMap, allKey).commits += 0 // same
	}
	// Minutes per day = sum of session active_minutes for sessions starting on that day.
	sessionByDay := map[string]int{}
	for _, s := range focusSessions {
		sessionByDay[dayKey(s.StartedAt)] += s.ActiveMinutes
	}

	// Build rollup slice.
	formula := metrics.DefaultScoreFormula()
	var rollups []models.DailyRollup
	for k, a := range accMap {
		r := models.DailyRollup{
			Scope:              k.scope,
			Day:                k.day,
			LiveAdditions:      a.liveAdd,
			LiveDeletions:      a.liveDel,
			StagedAdditions:    a.stagedAdd,
			StagedDeletions:    a.stagedDel,
			CommittedAdditions: a.committedAdd,
			CommittedDeletions: a.committedDel,
			Commits:            a.commits,
			Pushes:             a.pushes,
			FilesTouched:       len(a.files),
			LanguagesTouched:   len(a.langs),
		}
		if k.scope == "all" {
			r.FocusMinutes = sessionByDay[k.day]
		}
		r.Score = metrics.ComputeScore(r, formula)
		rollups = append(rollups, r)
	}

	// Compute achievements.
	totalPushes := 0
	for _, p := range pushEvents {
		if p.Kind == models.PushDetectedLocal {
			totalPushes++
		}
	}
	// Collect "all"-scope rollups for achievement evaluation.
	var allRollups []models.DailyRollup
	for _, r := range rollups {
		if r.Scope == "all" {
			allRollups = append(allRollups, r)
		}
	}
	achs := metrics.EvaluateAchievements(len(repoMap), totalPushes, allRollups, focusSessions)

	// Persist.
	if err := db.ReplaceFocusSessions(ctx, rt.pool, focusSessions); err != nil {
		return fmt.Errorf("replace sessions: %w", err)
	}
	if err := db.ReplaceDailyRollups(ctx, rt.pool, rollups); err != nil {
		return fmt.Errorf("replace rollups: %w", err)
	}
	if err := db.ReplaceAchievements(ctx, rt.pool, achs); err != nil {
		return fmt.Errorf("replace achievements: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// View generation
// ---------------------------------------------------------------------------

// DashboardView builds all data for the dashboard page.
func (rt *Runtime) DashboardView(ctx context.Context) (*models.DashboardView, error) {
	cfg := rt.Config()
	today := time.Now().UTC().Format("2006-01-02")

	// Today's "all" rollup.
	allRollups, err := db.AllRollupsForScope(ctx, rt.pool, "all")
	if err != nil {
		return nil, err
	}
	todayRollup := findRollup(allRollups, today)
	streaks := metrics.ComputeStreaks(allRollups)

	goals := cfg.Goals
	defaultGoals := config.GoalSettings{
		ChangedLinesPerDay: 250,
		CommitsPerDay:      3,
		FocusMinutesPerDay: 90,
	}
	if goals.ChangedLinesPerDay == 0 {
		goals.ChangedLinesPerDay = defaultGoals.ChangedLinesPerDay
	}
	if goals.CommitsPerDay == 0 {
		goals.CommitsPerDay = defaultGoals.CommitsPerDay
	}
	if goals.FocusMinutesPerDay == 0 {
		goals.FocusMinutesPerDay = defaultGoals.FocusMinutesPerDay
	}

	liveLines := 0
	stagedLines := 0
	commitsToday := 0
	pushesToday := 0
	focusToday := 0
	todayScore := 0
	if todayRollup != nil {
		liveLines = todayRollup.LiveAdditions + todayRollup.LiveDeletions
		stagedLines = todayRollup.StagedAdditions + todayRollup.StagedDeletions
		commitsToday = todayRollup.Commits
		pushesToday = todayRollup.Pushes
		focusToday = todayRollup.FocusMinutes
		todayScore = todayRollup.Score
	}

	goalProgress := []models.GoalProgress{
		{Label: "Changed Lines", Current: liveLines, Target: goals.ChangedLinesPerDay},
		{Label: "Commits", Current: commitsToday, Target: goals.CommitsPerDay},
		{Label: "Focus Minutes", Current: focusToday, Target: goals.FocusMinutesPerDay},
	}

	summary := models.TodaySummary{
		LiveLines:            liveLines,
		StagedLines:          stagedLines,
		CommitsToday:         commitsToday,
		PushesToday:          pushesToday,
		ActiveSessionMinutes: focusToday,
		StreakDays:           streaks.CurrentDays,
		BestStreakDays:       streaks.BestDays,
		TodayScore:           todayScore,
		Goals:                goalProgress,
	}

	feed, err := db.RecentActivityFeed(ctx, rt.pool, 20)
	if err != nil {
		return nil, err
	}

	// 30-day trend.
	trend := buildTrendPoints(allRollups, 30)
	// 84-day heatmap.
	heatmap := buildTrendPoints(allRollups, 84)

	cards, err := rt.RepositoryCards(ctx)
	if err != nil {
		return nil, err
	}

	return &models.DashboardView{
		Summary:      summary,
		ActivityFeed: feed,
		TrendPoints:  trend,
		HeatmapDays:  heatmap,
		RepoCards:    cards,
	}, nil
}

// RepositoryCards builds display cards for all non-removed repositories.
func (rt *Runtime) RepositoryCards(ctx context.Context) ([]models.RepoCard, error) {
	repos, err := db.ListRepositories(ctx, rt.pool)
	if err != nil {
		return nil, err
	}

	today := time.Now().UTC().Format("2006-01-02")
	var cards []models.RepoCard

	for _, repo := range repos {
		if repo.State == models.StateRemoved {
			continue
		}
		snap, _ := db.LatestSnapshot(ctx, rt.pool, repo.ID)
		health := assessHealth(snap)

		repoRollups, err := db.AllRollupsForScope(ctx, rt.pool, repo.ID.String())
		if err != nil {
			repoRollups = nil
		}
		todayMetrics := findRollup(repoRollups, today)

		// 7-day sparkline.
		sparkline := buildSparkline(repoRollups, 7)

		cards = append(cards, models.RepoCard{
			Repo:      repo,
			Snapshot:  snap,
			Health:    health,
			Metrics:   todayMetrics,
			Sparkline: sparkline,
		})
	}
	return cards, nil
}

// RepoDetail builds the full detail view for a single repository.
func (rt *Runtime) RepoDetail(ctx context.Context, selector string) (*models.RepoDetailView, error) {
	repo, err := db.FindRepository(ctx, rt.pool, selector)
	if err != nil || repo == nil {
		return nil, fmt.Errorf("repository not found: %s", selector)
	}

	snap, _ := db.LatestSnapshot(ctx, rt.pool, repo.ID)
	health := assessHealth(snap)
	today := time.Now().UTC().Format("2006-01-02")

	repoRollups, _ := db.AllRollupsForScope(ctx, rt.pool, repo.ID.String())
	todayMetrics := findRollup(repoRollups, today)
	sparkline := buildSparkline(repoRollups, 7)

	card := models.RepoCard{
		Repo:      *repo,
		Snapshot:  snap,
		Health:    health,
		Metrics:   todayMetrics,
		Sparkline: sparkline,
	}

	commits, err := db.ListCommits(ctx, rt.pool, &repo.ID, 20)
	if err != nil {
		commits = nil
	}
	pushes, err := db.ListPushEvents(ctx, rt.pool, &repo.ID, 10)
	if err != nil {
		pushes = nil
	}

	// Filter sessions that touched this repo.
	allSessions, err := db.ListFocusSessions(ctx, rt.pool, 200)
	if err != nil {
		allSessions = nil
	}
	var repoSessions []models.FocusSession
	for _, s := range allSessions {
		for _, id := range s.RepoIDs {
			if id == repo.ID {
				repoSessions = append(repoSessions, s)
				break
			}
		}
		if len(repoSessions) >= 10 {
			break
		}
	}

	var langBreakdown []models.LanguageStat
	if snap != nil {
		langBreakdown = snap.LanguageBreakdown
	}

	topFiles, _ := db.TopFilesTouched(ctx, rt.pool, &repo.ID, 12)

	return &models.RepoDetailView{
		Card:              card,
		IncludePatterns:   repo.IncludePatterns,
		ExcludePatterns:   repo.ExcludePatterns,
		RecentCommits:     commits,
		RecentPushes:      pushes,
		RecentSessions:    repoSessions,
		LanguageBreakdown: langBreakdown,
		TopFiles:          topFiles,
	}, nil
}

// SessionsSummary builds the sessions page data.
func (rt *Runtime) SessionsSummary(ctx context.Context) (*models.SessionSummary, error) {
	sess, err := db.ListFocusSessions(ctx, rt.pool, 50)
	if err != nil {
		return nil, err
	}

	var total, longest int
	for _, s := range sess {
		total += s.ActiveMinutes
		if s.ActiveMinutes > longest {
			longest = s.ActiveMinutes
		}
	}

	avg := 0
	if len(sess) > 0 {
		avg = total / len(sess)
	}

	return &models.SessionSummary{
		Sessions:              sess,
		TotalMinutes:          total,
		AverageLengthMinutes:  avg,
		LongestSessionMinutes: longest,
	}, nil
}

// AchievementsView returns achievements, streak summary, and today's score.
func (rt *Runtime) AchievementsView(ctx context.Context) ([]models.Achievement, models.StreakSummary, int, error) {
	achs, err := db.ListAchievements(ctx, rt.pool)
	if err != nil {
		return nil, models.StreakSummary{}, 0, err
	}

	allRollups, err := db.AllRollupsForScope(ctx, rt.pool, "all")
	if err != nil {
		return nil, models.StreakSummary{}, 0, err
	}

	streaks := metrics.ComputeStreaks(allRollups)
	today := time.Now().UTC().Format("2006-01-02")
	todayRollup := findRollup(allRollups, today)

	score := 0
	if todayRollup != nil {
		score = todayRollup.Score
	}

	return achs, streaks, score, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (rt *Runtime) filterForRepo(repo *models.Repository) (*filter.PathFilter, error) {
	cfg := rt.Config()

	include := repo.IncludePatterns
	exclude := repo.ExcludePatterns
	if len(include) == 0 {
		include = cfg.Patterns.Include
	}
	if len(exclude) == 0 {
		exclude = cfg.Patterns.Exclude
	}
	if len(exclude) == 0 {
		exclude = filter.DefaultExcludePatterns()
	}
	return filter.NewPathFilter(include, exclude)
}

func assessHealth(snap *models.RepoStatusSnapshot) models.RepoHealth {
	if snap == nil {
		return models.HealthError
	}
	if snap.IsDetached {
		return models.HealthDetachedHead
	}
	if snap.UpstreamRef == nil || *snap.UpstreamRef == "" {
		return models.HealthMissingUpstream
	}
	return models.HealthHealthy
}

func findRollup(rollups []models.DailyRollup, day string) *models.DailyRollup {
	for i := range rollups {
		if rollups[i].Day == day {
			return &rollups[i]
		}
	}
	return nil
}

func buildTrendPoints(rollups []models.DailyRollup, days int) []models.TrendPoint {
	// Sort by day descending.
	sorted := make([]models.DailyRollup, len(rollups))
	copy(sorted, rollups)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Day > sorted[j].Day
	})

	var points []models.TrendPoint
	for i, r := range sorted {
		if i >= days {
			break
		}
		points = append(points, models.TrendPoint{
			Day:          r.Day,
			ChangedLines: r.LiveAdditions + r.LiveDeletions,
			Commits:      r.Commits,
			Pushes:       r.Pushes,
			FocusMinutes: r.FocusMinutes,
			Score:        r.Score,
		})
	}
	// Return chronological order (oldest first).
	for i, j := 0, len(points)-1; i < j; i, j = i+1, j-1 {
		points[i], points[j] = points[j], points[i]
	}
	return points
}

func buildSparkline(rollups []models.DailyRollup, days int) []int {
	points := buildTrendPoints(rollups, days)
	vals := make([]int, len(points))
	maxVal := 1
	for i, p := range points {
		vals[i] = p.Score
		if p.Score > maxVal {
			maxVal = p.Score
		}
	}
	// Scale to 0-60px height.
	scaled := make([]int, len(vals))
	for i, v := range vals {
		scaled[i] = v * 60 / maxVal
	}
	return scaled
}

func loadTimezone(name string) *time.Location {
	if name == "" || strings.EqualFold(name, "UTC") {
		return time.UTC
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}
