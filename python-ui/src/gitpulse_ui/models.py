from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class APIModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class GoalProgress(APIModel):
    label: str
    current: int
    target: int
    percent: float


class TodaySummary(APIModel):
    live_lines: int
    staged_lines: int
    commits_today: int
    pushes_today: int
    active_session_minutes: int
    streak_days: int
    best_streak_days: int
    today_score: int
    goals: list[GoalProgress]


class TrendPoint(APIModel):
    day: str
    changed_lines: int = 0
    commits: int = 0
    pushes: int = 0
    focus_minutes: int = 0
    score: int


class ActivityFeedItem(APIModel):
    kind: str
    repo_name: str
    timestamp: datetime
    detail: str


class DailyRollup(APIModel):
    commits: int = 0
    pushes: int = 0
    files_touched: int = 0
    score: int = 0


class RepoStatusSnapshot(APIModel):
    observed_at: datetime | None = None
    branch: str | None = None
    is_detached: bool = False
    head_sha: str | None = None
    upstream_ref: str | None = None
    upstream_head_sha: str | None = None
    ahead_count: int = 0
    behind_count: int = 0
    live_additions: int = 0
    live_deletions: int = 0
    live_files: int = 0
    staged_additions: int = 0
    staged_deletions: int = 0
    staged_files: int = 0


class Repository(APIModel):
    id: str
    name: str
    root_path: str
    is_monitored: bool
    state: str | None = None
    updated_at: datetime | None = None
    last_error: str | None = None


def _empty_int_list() -> list[int]:
    return []


def _list_or_empty(value: object) -> object:
    return [] if value is None else value


class RepositoryCard(APIModel):
    repo: Repository
    health: str
    metrics: DailyRollup | None = None
    sparkline: list[int] = Field(default_factory=_empty_int_list)
    snapshot: RepoStatusSnapshot | None = None

    _normalize_sparkline = field_validator("sparkline", mode="before")(_list_or_empty)


class LanguageStat(APIModel):
    language: str
    code: int
    comments: int = 0
    blanks: int = 0


class CommitEvent(APIModel):
    id: str
    commit_sha: str
    summary: str
    additions: int
    deletions: int
    authored_at: datetime


class FocusSession(APIModel):
    id: str
    started_at: datetime
    ended_at: datetime
    active_minutes: int
    total_changed_lines: int


class PushEvent(APIModel):
    id: str
    observed_at: datetime
    kind: str
    head_sha: str | None = None
    pushed_commit_count: int = 0
    upstream_ref: str | None = None
    notes: str | None = None


def _empty_push_events() -> list[PushEvent]:
    return []


class RepoDetailView(APIModel):
    card: RepositoryCard
    include_patterns: list[str]
    exclude_patterns: list[str]
    recent_commits: list[CommitEvent]
    recent_pushes: list[PushEvent] = Field(default_factory=_empty_push_events)
    recent_sessions: list[FocusSession]
    language_breakdown: list[LanguageStat]
    top_files: list[str]

    _normalize_lists = field_validator(
        "include_patterns",
        "exclude_patterns",
        "recent_commits",
        "recent_pushes",
        "recent_sessions",
        "language_breakdown",
        "top_files",
        mode="before",
    )(_list_or_empty)


class DashboardView(APIModel):
    summary: TodaySummary
    trend_points: list[TrendPoint]
    heatmap_days: list[TrendPoint]
    activity_feed: list[ActivityFeedItem]
    repo_cards: list[RepositoryCard]

    _normalize_lists = field_validator(
        "trend_points",
        "heatmap_days",
        "activity_feed",
        "repo_cards",
        mode="before",
    )(_list_or_empty)


class SessionSummary(APIModel):
    sessions: list[FocusSession]
    total_minutes: int
    average_length_minutes: int
    longest_session_minutes: int

    _normalize_sessions = field_validator("sessions", mode="before")(_list_or_empty)


class Achievement(APIModel):
    kind: str
    reason: str
    unlocked_at: datetime
    day: str | None = None


class StreakSummary(APIModel):
    current_days: int
    best_days: int


class AchievementsResponse(APIModel):
    achievements: list[Achievement]
    streaks: StreakSummary
    today_score: int

    _normalize_achievements = field_validator("achievements", mode="before")(_list_or_empty)


class AuthorIdentity(APIModel):
    email: str


class GoalConfig(APIModel):
    changed_lines_per_day: int
    commits_per_day: int
    focus_minutes_per_day: int


class MonitoringConfig(APIModel):
    session_gap_minutes: int
    import_days: int


class UIConfig(APIModel):
    timezone: str
    day_boundary_minutes: int


class PatternConfig(APIModel):
    include: list[str]
    exclude: list[str]

    _normalize_lists = field_validator("include", "exclude", mode="before")(_list_or_empty)


class GithubConfig(APIModel):
    enabled: bool
    verify_remote_pushes: bool


class RuntimeConfig(APIModel):
    authors: list[AuthorIdentity]
    goals: GoalConfig
    monitoring: MonitoringConfig
    ui: UIConfig
    patterns: PatternConfig
    github: GithubConfig

    _normalize_authors = field_validator("authors", mode="before")(_list_or_empty)


class AppPaths(APIModel):
    config_file: str = ""
    config_dir: str = ""
    data_dir: str = ""


class SettingsResponse(APIModel):
    config: RuntimeConfig
    paths: AppPaths


class ActionResult(APIModel):
    action: str
    title: str
    summary: str
    lines: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    _normalize_lists = field_validator("lines", "warnings", mode="before")(_list_or_empty)


class SaveSettingsRequest(APIModel):
    authors: list[str]
    changed_lines_per_day: int
    commits_per_day: int
    focus_minutes_per_day: int
    timezone: str
    day_boundary_minutes: int
    session_gap_minutes: int
    import_days: int
    include_patterns: list[str]
    exclude_patterns: list[str]
    github_enabled: bool
    github_verify_remote_pushes: bool
    github_token: str
