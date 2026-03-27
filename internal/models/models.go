package models

import (
	"time"

	"github.com/google/uuid"
)

// RepositoryState represents the lifecycle state of a tracked repository.
type RepositoryState string

const (
	StateActive   RepositoryState = "active"
	StateDisabled RepositoryState = "disabled"
	StateRemoved  RepositoryState = "removed"
)

// PushKind distinguishes locally-inferred pushes from remotely-confirmed ones.
type PushKind string

const (
	PushDetectedLocal   PushKind = "push_detected_local"
	PushRemoteConfirmed PushKind = "push_remote_confirmed"
)

// ActivityKind describes the source of a file activity event.
type ActivityKind string

const (
	ActivityRefresh      ActivityKind = "refresh"
	ActivityImport       ActivityKind = "import"
	ActivityCommit       ActivityKind = "commit"
	ActivityPush         ActivityKind = "push"
	ActivityManualRescan ActivityKind = "manual_rescan"
)

// RepoHealth summarizes the git health of a repository.
type RepoHealth string

const (
	HealthHealthy         RepoHealth = "Healthy"
	HealthMissingUpstream RepoHealth = "No Upstream"
	HealthDetachedHead    RepoHealth = "Detached HEAD"
	HealthError           RepoHealth = "Error"
)

// AchievementKind enumerates the available achievement types.
type AchievementKind string

const (
	AchFirstRepo          AchievementKind = "first_repo"
	AchFirstCommitTracked AchievementKind = "first_commit_tracked"
	AchFirstPushDetected  AchievementKind = "first_push_detected"
	AchLines100           AchievementKind = "lines_100"
	AchLines1000          AchievementKind = "lines_1000"
	AchCommits5           AchievementKind = "commits_5"
	AchRefactorer         AchievementKind = "refactorer"
	AchPolyglot           AchievementKind = "polyglot"
	AchFocus50            AchievementKind = "focus_50"
)

// TrackedTarget is a root path (single repo or folder) added by the user.
type TrackedTarget struct {
	ID         uuid.UUID  `json:"id"`
	Path       string     `json:"path"`
	Kind       string     `json:"kind"`
	CreatedAt  time.Time  `json:"created_at"`
	LastScanAt *time.Time `json:"last_scan_at"`
}

// Repository is a git repository tracked by gitpulse.
type Repository struct {
	ID              uuid.UUID       `json:"id"`
	TargetID        *uuid.UUID      `json:"target_id"`
	Name            string          `json:"name"`
	RootPath        string          `json:"root_path"`
	RemoteURL       *string         `json:"remote_url"`
	DefaultBranch   *string         `json:"default_branch"`
	IncludePatterns []string        `json:"include_patterns"`
	ExcludePatterns []string        `json:"exclude_patterns"`
	IsMonitored     bool            `json:"is_monitored"`
	State           RepositoryState `json:"state"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
	LastError       *string         `json:"last_error"`
}

// RepoStatusSnapshot captures the git state of a repository at a point in time.
type RepoStatusSnapshot struct {
	ID                uuid.UUID      `json:"id"`
	RepoID            uuid.UUID      `json:"repo_id"`
	ObservedAt        time.Time      `json:"observed_at"`
	Branch            *string        `json:"branch"`
	IsDetached        bool           `json:"is_detached"`
	HeadSHA           *string        `json:"head_sha"`
	UpstreamRef       *string        `json:"upstream_ref"`
	UpstreamHeadSHA   *string        `json:"upstream_head_sha"`
	AheadCount        int            `json:"ahead_count"`
	BehindCount       int            `json:"behind_count"`
	LiveAdditions     int            `json:"live_additions"`
	LiveDeletions     int            `json:"live_deletions"`
	LiveFiles         int            `json:"live_files"`
	StagedAdditions   int            `json:"staged_additions"`
	StagedDeletions   int            `json:"staged_deletions"`
	StagedFiles       int            `json:"staged_files"`
	FilesTouched      int            `json:"files_touched"`
	RepoSizeBytes     int64          `json:"repo_size_bytes"`
	LanguageBreakdown []LanguageStat `json:"language_breakdown"`
}

// DiffStats holds line change counts from a git diff.
type DiffStats struct {
	Additions int `json:"additions"`
	Deletions int `json:"deletions"`
	FileCount int `json:"file_count"`
}

// TotalChangedLines returns the sum of additions and deletions.
func (d DiffStats) TotalChangedLines() int {
	return d.Additions + d.Deletions
}

// LanguageStat holds Tokei-style language statistics.
type LanguageStat struct {
	Language string `json:"language"`
	Code     int    `json:"code"`
	Comments int    `json:"comments"`
	Blanks   int    `json:"blanks"`
}

// CommitEvent represents a git commit imported from history.
type CommitEvent struct {
	ID           uuid.UUID `json:"id"`
	RepoID       uuid.UUID `json:"repo_id"`
	CommitSHA    string    `json:"commit_sha"`
	AuthoredAt   time.Time `json:"authored_at"`
	AuthorName   *string   `json:"author_name"`
	AuthorEmail  *string   `json:"author_email"`
	Summary      string    `json:"summary"`
	Branch       *string   `json:"branch"`
	Additions    int       `json:"additions"`
	Deletions    int       `json:"deletions"`
	FilesChanged int       `json:"files_changed"`
	IsMerge      bool      `json:"is_merge"`
	ImportedAt   time.Time `json:"imported_at"`
}

// PushEvent represents a detected or confirmed push to a remote.
type PushEvent struct {
	ID                uuid.UUID `json:"id"`
	RepoID            uuid.UUID `json:"repo_id"`
	ObservedAt        time.Time `json:"observed_at"`
	Kind              PushKind  `json:"kind"`
	HeadSHA           *string   `json:"head_sha"`
	PushedCommitCount int       `json:"pushed_commit_count"`
	UpstreamRef       *string   `json:"upstream_ref"`
	Notes             *string   `json:"notes"`
}

// FileActivityEvent records file-level change activity from any source.
type FileActivityEvent struct {
	ID           uuid.UUID    `json:"id"`
	RepoID       uuid.UUID    `json:"repo_id"`
	ObservedAt   time.Time    `json:"observed_at"`
	RelativePath string       `json:"relative_path"`
	Additions    int          `json:"additions"`
	Deletions    int          `json:"deletions"`
	Kind         ActivityKind `json:"kind"`
}

// ActivityPoint is a lightweight event used for session detection.
type ActivityPoint struct {
	RepoID       uuid.UUID    `json:"repo_id"`
	ObservedAt   time.Time    `json:"observed_at"`
	Kind         ActivityKind `json:"kind"`
	ChangedLines int          `json:"changed_lines"`
}

// FocusSession is a contiguous block of activity inferred from event gaps.
type FocusSession struct {
	ID                uuid.UUID   `json:"id"`
	StartedAt         time.Time   `json:"started_at"`
	EndedAt           time.Time   `json:"ended_at"`
	ActiveMinutes     int         `json:"active_minutes"`
	RepoIDs           []uuid.UUID `json:"repo_ids"`
	EventCount        int         `json:"event_count"`
	TotalChangedLines int         `json:"total_changed_lines"`
}

// DailyRollup holds aggregated per-day metrics for a repo (or "all").
type DailyRollup struct {
	Scope              string `json:"scope"`
	Day                string `json:"day"`
	LiveAdditions      int    `json:"live_additions"`
	LiveDeletions      int    `json:"live_deletions"`
	StagedAdditions    int    `json:"staged_additions"`
	StagedDeletions    int    `json:"staged_deletions"`
	CommittedAdditions int    `json:"committed_additions"`
	CommittedDeletions int    `json:"committed_deletions"`
	Commits            int    `json:"commits"`
	Pushes             int    `json:"pushes"`
	FocusMinutes       int    `json:"focus_minutes"`
	FilesTouched       int    `json:"files_touched"`
	LanguagesTouched   int    `json:"languages_touched"`
	Score              int    `json:"score"`
}

// TrendPoint is a single day in a trend or heatmap visualization.
type TrendPoint struct {
	Day          string `json:"day"`
	ChangedLines int    `json:"changed_lines"`
	Commits      int    `json:"commits"`
	Pushes       int    `json:"pushes"`
	FocusMinutes int    `json:"focus_minutes"`
	Score        int    `json:"score"`
}

// Achievement records an unlocked achievement.
type Achievement struct {
	Kind       AchievementKind `json:"kind"`
	UnlockedAt time.Time       `json:"unlocked_at"`
	Day        *string         `json:"day"`
	Reason     string          `json:"reason"`
}

// GoalSettings holds the user's daily productivity targets.
type GoalSettings struct {
	ChangedLinesPerDay int `json:"changed_lines_per_day"`
	CommitsPerDay      int `json:"commits_per_day"`
	FocusMinutesPerDay int `json:"focus_minutes_per_day"`
}

// DefaultGoalSettings returns the default targets.
func DefaultGoalSettings() GoalSettings {
	return GoalSettings{
		ChangedLinesPerDay: 250,
		CommitsPerDay:      3,
		FocusMinutesPerDay: 90,
	}
}

// GoalProgress describes progress towards a single goal.
type GoalProgress struct {
	Label   string  `json:"label"`
	Current int     `json:"current"`
	Target  int     `json:"target"`
	Percent float64 `json:"percent"`
}

// ComputePercent returns the completion percentage capped at 100.
func (g GoalProgress) ComputePercent() float64 {
	if g.Target <= 0 {
		return 0
	}
	p := float64(g.Current) / float64(g.Target) * 100
	if p > 100 {
		return 100
	}
	return p
}

// StreakSummary holds current and best consecutive-day streak counts.
type StreakSummary struct {
	CurrentDays int `json:"current_days"`
	BestDays    int `json:"best_days"`
}

// TodaySummary is the headline metrics for the dashboard.
type TodaySummary struct {
	LiveLines            int            `json:"live_lines"`
	StagedLines          int            `json:"staged_lines"`
	CommitsToday         int            `json:"commits_today"`
	PushesToday          int            `json:"pushes_today"`
	ActiveSessionMinutes int            `json:"active_session_minutes"`
	StreakDays           int            `json:"streak_days"`
	BestStreakDays       int            `json:"best_streak_days"`
	TodayScore           int            `json:"today_score"`
	Goals                []GoalProgress `json:"goals"`
}

// ActivityFeedItem is a single entry in the activity feed.
type ActivityFeedItem struct {
	Kind      string    `json:"kind"`
	RepoName  string    `json:"repo_name"`
	Timestamp time.Time `json:"timestamp"`
	Detail    string    `json:"detail"`
}

// RepoCard bundles display data for a single repository widget.
type RepoCard struct {
	Repo      Repository          `json:"repo"`
	Snapshot  *RepoStatusSnapshot `json:"snapshot"`
	Health    RepoHealth          `json:"health"`
	Metrics   *DailyRollup        `json:"metrics"`
	Sparkline []int               `json:"sparkline"`
}

// RepoDetailView is the full data bundle for the repository detail page.
type RepoDetailView struct {
	Card              RepoCard       `json:"card"`
	IncludePatterns   []string       `json:"include_patterns"`
	ExcludePatterns   []string       `json:"exclude_patterns"`
	RecentCommits     []CommitEvent  `json:"recent_commits"`
	RecentPushes      []PushEvent    `json:"recent_pushes"`
	RecentSessions    []FocusSession `json:"recent_sessions"`
	LanguageBreakdown []LanguageStat `json:"language_breakdown"`
	TopFiles          []string       `json:"top_files"`
}

// DashboardView bundles all data for the dashboard page.
type DashboardView struct {
	Summary      TodaySummary       `json:"summary"`
	ActivityFeed []ActivityFeedItem `json:"activity_feed"`
	TrendPoints  []TrendPoint       `json:"trend_points"`
	HeatmapDays  []TrendPoint       `json:"heatmap_days"`
	RepoCards    []RepoCard         `json:"repo_cards"`
}

// SessionSummary holds aggregate statistics for the sessions page.
type SessionSummary struct {
	Sessions              []FocusSession `json:"sessions"`
	TotalMinutes          int            `json:"total_minutes"`
	AverageLengthMinutes  int            `json:"average_length_minutes"`
	LongestSessionMinutes int            `json:"longest_session_minutes"`
}

// RebuildReport describes the outcome of an analytics rebuild.
type RebuildReport struct {
	SessionsWritten     int           `json:"sessions_written"`
	RollupsWritten      int           `json:"rollups_written"`
	AchievementsWritten int           `json:"achievements_written"`
	Elapsed             time.Duration `json:"elapsed"`
}

// OperatorActionResult describes the outcome of a manual operator-triggered task.
type OperatorActionResult struct {
	Action   string   `json:"action"`
	Title    string   `json:"title"`
	Summary  string   `json:"summary"`
	Lines    []string `json:"lines"`
	Warnings []string `json:"warnings,omitempty"`
}
