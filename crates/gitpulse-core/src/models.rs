use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::config::RepoPatternSettings;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RepositoryState {
    Active,
    Disabled,
    Removed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RepoHealth {
    Healthy,
    MissingUpstream,
    DetachedHead,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ActivityKind {
    Refresh,
    Commit,
    Push,
    Import,
    ManualRescan,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PushEventKind {
    PushDetectedLocal,
    PushRemoteConfirmed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiffStats {
    pub additions: i64,
    pub deletions: i64,
    pub file_count: i64,
}

impl DiffStats {
    pub fn total_changed_lines(&self) -> i64 {
        self.additions + self.deletions
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Repository {
    pub id: Uuid,
    pub name: String,
    pub root_path: String,
    pub remote_url: Option<String>,
    pub default_branch: Option<String>,
    pub is_monitored: bool,
    pub state: RepositoryState,
    pub created_at_utc: DateTime<Utc>,
    pub updated_at_utc: DateTime<Utc>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepoStatusSnapshot {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub observed_at_utc: DateTime<Utc>,
    pub branch: Option<String>,
    pub is_detached: bool,
    pub head_sha: Option<String>,
    pub upstream_ref: Option<String>,
    pub upstream_head_sha: Option<String>,
    pub ahead_count: i64,
    pub behind_count: i64,
    pub live_stats: DiffStats,
    pub staged_stats: DiffStats,
    pub files_touched: i64,
    pub repo_size_bytes: i64,
    pub language_breakdown_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommitEvent {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub commit_sha: String,
    pub authored_at_utc: DateTime<Utc>,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
    pub summary: String,
    pub branch: Option<String>,
    pub additions: i64,
    pub deletions: i64,
    pub files_changed: i64,
    pub is_merge: bool,
    pub imported_at_utc: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PushEvent {
    pub id: Uuid,
    pub repo_id: Uuid,
    pub observed_at_utc: DateTime<Utc>,
    pub kind: PushEventKind,
    pub head_sha: Option<String>,
    pub pushed_commit_count: i64,
    pub upstream_ref: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ActivityPoint {
    pub repo_id: Uuid,
    pub observed_at_utc: DateTime<Utc>,
    pub kind: ActivityKind,
    pub changed_lines: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FocusSession {
    pub id: Uuid,
    pub started_at_utc: DateTime<Utc>,
    pub ended_at_utc: DateTime<Utc>,
    pub active_minutes: i64,
    pub repo_ids: Vec<Uuid>,
    pub event_count: i64,
    pub total_changed_lines: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DailyRollup {
    pub repo_id: Option<Uuid>,
    pub day: NaiveDate,
    pub live_additions: i64,
    pub live_deletions: i64,
    pub staged_additions: i64,
    pub staged_deletions: i64,
    pub committed_additions: i64,
    pub committed_deletions: i64,
    pub commits: i64,
    pub pushes: i64,
    pub focus_minutes: i64,
    pub files_touched: i64,
    pub languages_touched: i64,
    pub score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoalProgress {
    pub label: String,
    pub current: i64,
    pub target: i64,
}

impl GoalProgress {
    pub fn percent(&self) -> i64 {
        if self.target <= 0 {
            return 0;
        }
        (self.current.saturating_mul(100) / self.target).clamp(0, 100)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TodaySummary {
    pub live_lines: i64,
    pub staged_lines: i64,
    pub commits_today: i64,
    pub pushes_today: i64,
    pub active_session_minutes: i64,
    pub streak_days: i64,
    pub best_streak_days: i64,
    pub today_score: i64,
    pub goal_progress: Vec<GoalProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StatusSummary {
    pub branch_label: String,
    pub upstream_label: String,
    pub live_stats: DiffStats,
    pub staged_stats: DiffStats,
    pub last_push_at_utc: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepositoryMetrics {
    pub commits_today: i64,
    pub pushes_today: i64,
    pub files_touched_today: i64,
    pub focus_minutes_today: i64,
    pub score_today: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepoCard {
    pub repo: Repository,
    pub snapshot: Option<RepoStatusSnapshot>,
    pub health: RepoHealth,
    pub metrics: RepositoryMetrics,
    pub sparkline: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrendPoint {
    pub day: NaiveDate,
    pub changed_lines: i64,
    pub commits: i64,
    pub pushes: i64,
    pub focus_minutes: i64,
    pub score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionSummary {
    pub sessions: Vec<FocusSession>,
    pub total_minutes: i64,
    pub average_length_minutes: i64,
    pub longest_session_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RepoDetailView {
    pub card: RepoCard,
    pub pattern_overrides: RepoPatternSettings,
    pub recent_commits: Vec<CommitEvent>,
    pub recent_pushes: Vec<PushEvent>,
    pub recent_sessions: Vec<FocusSession>,
    pub language_breakdown: Vec<(String, i64)>,
    pub files_touched: Vec<(String, i64)>,
}
