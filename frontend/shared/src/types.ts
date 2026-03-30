export type RepositoryState = "active" | "disabled" | "removed";
export type PushKind = "push_detected_local" | "push_remote_confirmed";
export type RepoHealth = "Healthy" | "No Upstream" | "Detached HEAD" | "Error";

export interface ErrorResponse {
  error: string;
}

export interface DataEnvelope<T> {
  data: T;
}

export interface AuthorIdentity {
  email: string;
  name?: string;
  aliases?: string[];
}

export interface GoalProgress {
  label: string;
  current: number;
  target: number;
  percent: number;
}

export interface TodaySummary {
  live_lines: number;
  staged_lines: number;
  commits_today: number;
  pushes_today: number;
  active_session_minutes: number;
  streak_days: number;
  best_streak_days: number;
  today_score: number;
  goals: GoalProgress[];
}

export interface TrendPoint {
  day: string;
  changed_lines: number;
  commits: number;
  pushes: number;
  focus_minutes: number;
  score: number;
}

export interface ActivityFeedItem {
  kind: string;
  repo_name: string;
  timestamp: string;
  detail: string;
}

export interface LanguageStat {
  language: string;
  code: number;
  comments: number;
  blanks: number;
}

export interface Repository {
  id: string;
  target_id?: string | null;
  name: string;
  root_path: string;
  remote_url?: string | null;
  default_branch?: string | null;
  include_patterns: string[];
  exclude_patterns: string[];
  is_monitored: boolean;
  state: RepositoryState;
  created_at: string;
  updated_at: string;
  last_error?: string | null;
}

export interface RepoStatusSnapshot {
  id: string;
  repo_id: string;
  observed_at: string;
  branch?: string | null;
  is_detached: boolean;
  head_sha?: string | null;
  upstream_ref?: string | null;
  upstream_head_sha?: string | null;
  ahead_count: number;
  behind_count: number;
  live_additions: number;
  live_deletions: number;
  live_files: number;
  staged_additions: number;
  staged_deletions: number;
  staged_files: number;
  files_touched: number;
  repo_size_bytes: number;
  language_breakdown: LanguageStat[];
}

export interface CommitEvent {
  id: string;
  repo_id: string;
  commit_sha: string;
  authored_at: string;
  author_name?: string | null;
  author_email?: string | null;
  summary: string;
  branch?: string | null;
  additions: number;
  deletions: number;
  files_changed: number;
  is_merge: boolean;
  imported_at: string;
}

export interface PushEvent {
  id: string;
  repo_id: string;
  observed_at: string;
  kind: PushKind;
  head_sha?: string | null;
  pushed_commit_count: number;
  upstream_ref?: string | null;
  notes?: string | null;
}

export interface FocusSession {
  id: string;
  started_at: string;
  ended_at: string;
  active_minutes: number;
  repo_ids: string[];
  event_count: number;
  total_changed_lines: number;
}

export interface DailyRollup {
  scope: string;
  day: string;
  live_additions: number;
  live_deletions: number;
  staged_additions: number;
  staged_deletions: number;
  committed_additions: number;
  committed_deletions: number;
  commits: number;
  pushes: number;
  focus_minutes: number;
  files_touched: number;
  languages_touched: number;
  score: number;
}

export interface RepoCard {
  repo: Repository;
  snapshot?: RepoStatusSnapshot | null;
  health: RepoHealth;
  metrics?: DailyRollup | null;
  sparkline: number[];
}

export interface RepoDetailView {
  card: RepoCard;
  include_patterns: string[];
  exclude_patterns: string[];
  recent_commits: CommitEvent[];
  recent_pushes: PushEvent[];
  recent_sessions: FocusSession[];
  language_breakdown: LanguageStat[];
  top_files: string[];
}

export interface DashboardView {
  summary: TodaySummary;
  activity_feed: ActivityFeedItem[];
  trend_points: TrendPoint[];
  heatmap_days: TrendPoint[];
  repo_cards: RepoCard[];
}

export interface RepositoriesPayload {
  repositories: RepoCard[];
}

export interface SessionSummary {
  sessions: FocusSession[];
  total_minutes: number;
  average_length_minutes: number;
  longest_session_minutes: number;
}

export interface Achievement {
  kind: string;
  unlocked_at: string;
  day?: string | null;
  reason: string;
}

export interface StreakSummary {
  current_days: number;
  best_days: number;
}

export interface AchievementsView {
  achievements: Achievement[];
  streaks: StreakSummary;
  today_score: number;
}

export interface GoalConfig {
  changed_lines_per_day: number;
  commits_per_day: number;
  focus_minutes_per_day: number;
}

export interface MonitoringConfig {
  import_days: number;
  session_gap_minutes: number;
  repo_discovery_depth?: number;
}

export interface UIConfig {
  timezone: string;
  day_boundary_minutes: number;
}

export interface PatternConfig {
  include: string[];
  exclude: string[];
}

export interface GithubConfig {
  enabled: boolean;
  token?: string | null;
  verify_remote_pushes: boolean;
}

export interface DatabaseConfig {
  path: string;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface RuntimeConfig {
  authors: AuthorIdentity[];
  goals: GoalConfig;
  patterns: PatternConfig;
  github: GithubConfig;
  monitoring: MonitoringConfig;
  ui: UIConfig;
  database?: DatabaseConfig;
  server?: ServerConfig;
}

export interface AppPaths {
  config_dir: string;
  data_dir: string;
  config_file: string;
}

export interface SettingsView {
  config: RuntimeConfig;
  paths: AppPaths;
}

export interface OperatorActionResult {
  action: string;
  title: string;
  summary: string;
  lines: string[];
  warnings?: string[];
}

export interface ActionPayload {
  result: OperatorActionResult;
  repositories?: Repository[];
  repository?: Repository | null;
  repository_card?: RepoCard | null;
  settings?: SettingsView | null;
}

export interface SaveSettingsRequest {
  authors: string[];
  changed_lines_per_day: number;
  commits_per_day: number;
  focus_minutes_per_day: number;
  timezone: string;
  day_boundary_minutes: number;
  session_gap_minutes: number;
  import_days: number;
  include_patterns: string[];
  exclude_patterns: string[];
  github_enabled: boolean;
  github_verify_remote_pushes: boolean;
  github_token: string;
}
