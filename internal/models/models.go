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
	ID         uuid.UUID
	Path       string
	Kind       string // "repo" or "folder"
	CreatedAt  time.Time
	LastScanAt *time.Time
}

// Repository is a git repository tracked by gitpulse.
type Repository struct {
	ID              uuid.UUID
	TargetID        *uuid.UUID
	Name            string
	RootPath        string
	RemoteURL       *string
	DefaultBranch   *string
	IncludePatterns []string
	ExcludePatterns []string
	IsMonitored     bool
	State           RepositoryState
	CreatedAt       time.Time
	UpdatedAt       time.Time
	LastError       *string
}

// RepoStatusSnapshot captures the git state of a repository at a point in time.
type RepoStatusSnapshot struct {
	ID                uuid.UUID
	RepoID            uuid.UUID
	ObservedAt        time.Time
	Branch            *string
	IsDetached        bool
	HeadSHA           *string
	UpstreamRef       *string
	UpstreamHeadSHA   *string
	AheadCount        int
	BehindCount       int
	LiveAdditions     int
	LiveDeletions     int
	LiveFiles         int
	StagedAdditions   int
	StagedDeletions   int
	StagedFiles       int
	FilesTouched      int
	RepoSizeBytes     int64
	LanguageBreakdown []LanguageStat
}

// DiffStats holds line change counts from a git diff.
type DiffStats struct {
	Additions int
	Deletions int
	FileCount int
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
	ID           uuid.UUID
	RepoID       uuid.UUID
	CommitSHA    string
	AuthoredAt   time.Time
	AuthorName   *string
	AuthorEmail  *string
	Summary      string
	Branch       *string
	Additions    int
	Deletions    int
	FilesChanged int
	IsMerge      bool
	ImportedAt   time.Time
}

// PushEvent represents a detected or confirmed push to a remote.
type PushEvent struct {
	ID                uuid.UUID
	RepoID            uuid.UUID
	ObservedAt        time.Time
	Kind              PushKind
	HeadSHA           *string
	PushedCommitCount int
	UpstreamRef       *string
	Notes             *string
}

// FileActivityEvent records file-level change activity from any source.
type FileActivityEvent struct {
	ID           uuid.UUID
	RepoID       uuid.UUID
	ObservedAt   time.Time
	RelativePath string
	Additions    int
	Deletions    int
	Kind         ActivityKind
}

// ActivityPoint is a lightweight event used for session detection.
type ActivityPoint struct {
	RepoID       uuid.UUID
	ObservedAt   time.Time
	Kind         ActivityKind
	ChangedLines int
}

// FocusSession is a contiguous block of activity inferred from event gaps.
type FocusSession struct {
	ID                uuid.UUID
	StartedAt         time.Time
	EndedAt           time.Time
	ActiveMinutes     int
	RepoIDs           []uuid.UUID
	EventCount        int
	TotalChangedLines int
}

// DailyRollup holds aggregated per-day metrics for a repo (or "all").
type DailyRollup struct {
	Scope              string // UUID string or "all"
	Day                string // YYYY-MM-DD
	LiveAdditions      int
	LiveDeletions      int
	StagedAdditions    int
	StagedDeletions    int
	CommittedAdditions int
	CommittedDeletions int
	Commits            int
	Pushes             int
	FocusMinutes       int
	FilesTouched       int
	LanguagesTouched   int
	Score              int
}

// TrendPoint is a single day in a trend or heatmap visualization.
type TrendPoint struct {
	Day          string
	ChangedLines int
	Commits      int
	Pushes       int
	FocusMinutes int
	Score        int
}

// Achievement records an unlocked achievement.
type Achievement struct {
	Kind       AchievementKind
	UnlockedAt time.Time
	Day        *string
	Reason     string
}

// GoalSettings holds the user's daily productivity targets.
type GoalSettings struct {
	ChangedLinesPerDay int
	CommitsPerDay      int
	FocusMinutesPerDay int
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
	Label   string
	Current int
	Target  int
}

// Percent returns the completion percentage capped at 100.
func (g GoalProgress) Percent() float64 {
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
	CurrentDays int
	BestDays    int
}

// TodaySummary is the headline metrics for the dashboard.
type TodaySummary struct {
	LiveLines            int
	StagedLines          int
	CommitsToday         int
	PushesToday          int
	ActiveSessionMinutes int
	StreakDays           int
	BestStreakDays       int
	TodayScore           int
	Goals                []GoalProgress
}

// ActivityFeedItem is a single entry in the activity feed.
type ActivityFeedItem struct {
	Kind      string
	RepoName  string
	Timestamp time.Time
	Detail    string
}

// RepoCard bundles display data for a single repository widget.
type RepoCard struct {
	Repo      Repository
	Snapshot  *RepoStatusSnapshot
	Health    RepoHealth
	Metrics   *DailyRollup
	Sparkline []int // 7-day score values (scaled to pixel heights)
}

// RepoDetailView is the full data bundle for the repository detail page.
type RepoDetailView struct {
	Card              RepoCard
	IncludePatterns   []string
	ExcludePatterns   []string
	RecentCommits     []CommitEvent
	RecentPushes      []PushEvent
	RecentSessions    []FocusSession
	LanguageBreakdown []LanguageStat
	TopFiles          []string
}

// DashboardView bundles all data for the dashboard page.
type DashboardView struct {
	Summary      TodaySummary
	ActivityFeed []ActivityFeedItem
	TrendPoints  []TrendPoint // 30 days
	HeatmapDays  []TrendPoint // 84 days
	RepoCards    []RepoCard
}

// SessionSummary holds aggregate statistics for the sessions page.
type SessionSummary struct {
	Sessions              []FocusSession
	TotalMinutes          int
	AverageLengthMinutes  int
	LongestSessionMinutes int
}

// RebuildReport describes the outcome of an analytics rebuild.
type RebuildReport struct {
	SessionsWritten     int
	RollupsWritten      int
	AchievementsWritten int
	Elapsed             time.Duration
}
