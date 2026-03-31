import { z } from 'zod';

const timestampSchema = z.string().min(1);
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const primarySurfaceIds = [
  'dashboard',
  'repositories',
  'repository-detail',
  'sessions',
  'achievements',
  'settings',
] as const;

export const manualActionIds = [
  'add_target',
  'import_all',
  'rescan_all',
  'rebuild_analytics',
  'refresh_repo',
  'toggle_repo',
  'remove_repo',
  'save_repo_patterns',
  'import_repo',
  'save_settings',
] as const;

export const primarySurfaceSchema = z.enum(primarySurfaceIds);
export const manualActionSchema = z.enum(manualActionIds);

export const activityLedgerSchema = z.enum(['working_tree', 'commit', 'push']);
export const repositoryStateSchema = z.enum(['active', 'disabled', 'removed']);
export const repoHealthSchema = z.enum([
  'Healthy',
  'No Upstream',
  'Detached HEAD',
  'Error',
]);
export const activityFeedKindSchema = z.enum(['commit', 'push', 'file_change']);
export const pushKindSchema = z.enum([
  'push_detected_local',
  'push_remote_confirmed',
]);

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('gitpulse-vnext-api'),
  ledgers: z.array(activityLedgerSchema).length(3),
  surfaces: z.array(primarySurfaceSchema).length(6),
  manualActions: z.array(manualActionSchema).length(10),
  databaseHost: z.string().min(1),
});

export const goalProgressSchema = z.object({
  label: z.string().min(1),
  current: z.number().int(),
  target: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});

export const todaySummarySchema = z.object({
  live_lines: z.number().int(),
  staged_lines: z.number().int(),
  commits_today: z.number().int(),
  pushes_today: z.number().int(),
  active_session_minutes: z.number().int(),
  streak_days: z.number().int().nonnegative(),
  best_streak_days: z.number().int().nonnegative(),
  today_score: z.number().int(),
  goals: z.array(goalProgressSchema),
});

export const trendPointSchema = z.object({
  day: daySchema,
  changed_lines: z.number().int(),
  commits: z.number().int(),
  pushes: z.number().int(),
  focus_minutes: z.number().int(),
  score: z.number().int(),
});

export const activityFeedItemSchema = z.object({
  kind: activityFeedKindSchema,
  repo_name: z.string().min(1),
  timestamp: timestampSchema,
  detail: z.string().min(1),
});

export const languageStatSchema = z.object({
  language: z.string().min(1),
  code: z.number().int(),
  comments: z.number().int(),
  blanks: z.number().int(),
});

export const repositorySchema = z.object({
  id: z.string().uuid(),
  target_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  root_path: z.string().min(1),
  remote_url: z.string().min(1).nullable().optional(),
  default_branch: z.string().min(1).nullable().optional(),
  include_patterns: z.array(z.string()),
  exclude_patterns: z.array(z.string()),
  is_monitored: z.boolean(),
  state: repositoryStateSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  last_error: z.string().nullable().optional(),
});

export const repoStatusSnapshotSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  observed_at: timestampSchema,
  branch: z.string().min(1).nullable().optional(),
  is_detached: z.boolean(),
  head_sha: z.string().min(1).nullable().optional(),
  upstream_ref: z.string().min(1).nullable().optional(),
  upstream_head_sha: z.string().min(1).nullable().optional(),
  ahead_count: z.number().int(),
  behind_count: z.number().int(),
  live_additions: z.number().int(),
  live_deletions: z.number().int(),
  live_files: z.number().int(),
  staged_additions: z.number().int(),
  staged_deletions: z.number().int(),
  staged_files: z.number().int(),
  files_touched: z.number().int(),
  repo_size_bytes: z.number().int().nonnegative(),
  language_breakdown: z.array(languageStatSchema),
});

export const dailyRollupSchema = z.object({
  scope: z.string().min(1),
  day: daySchema,
  live_additions: z.number().int(),
  live_deletions: z.number().int(),
  staged_additions: z.number().int(),
  staged_deletions: z.number().int(),
  committed_additions: z.number().int(),
  committed_deletions: z.number().int(),
  commits: z.number().int(),
  pushes: z.number().int(),
  focus_minutes: z.number().int(),
  files_touched: z.number().int(),
  languages_touched: z.number().int(),
  score: z.number().int(),
});

export const repoCardSchema = z.object({
  repo: repositorySchema,
  snapshot: repoStatusSnapshotSchema.nullable().optional(),
  health: repoHealthSchema,
  metrics: dailyRollupSchema.nullable().optional(),
  sparkline: z.array(z.number().int().nonnegative()),
});

export const commitEventSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  commit_sha: z.string().min(1),
  authored_at: timestampSchema,
  author_name: z.string().min(1).nullable().optional(),
  author_email: z.string().min(1).nullable().optional(),
  summary: z.string().min(1),
  branch: z.string().min(1).nullable().optional(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_changed: z.number().int(),
  is_merge: z.boolean(),
  imported_at: timestampSchema,
});

export const pushEventSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  observed_at: timestampSchema,
  kind: pushKindSchema,
  head_sha: z.string().min(1).nullable().optional(),
  pushed_commit_count: z.number().int(),
  upstream_ref: z.string().min(1).nullable().optional(),
  notes: z.string().min(1).nullable().optional(),
});

export const focusSessionSchema = z.object({
  id: z.string().uuid(),
  started_at: timestampSchema,
  ended_at: timestampSchema,
  active_minutes: z.number().int().nonnegative(),
  repo_ids: z.array(z.string().uuid()),
  event_count: z.number().int().nonnegative(),
  total_changed_lines: z.number().int().nonnegative(),
});

export const dashboardViewSchema = z.object({
  summary: todaySummarySchema,
  activity_feed: z.array(activityFeedItemSchema),
  trend_points: z.array(trendPointSchema),
  heatmap_days: z.array(trendPointSchema),
  repo_cards: z.array(repoCardSchema),
});

export const repositoriesPayloadSchema = z.object({
  repositories: z.array(repoCardSchema),
});

export const repoDetailViewSchema = z.object({
  card: repoCardSchema,
  include_patterns: z.array(z.string()),
  exclude_patterns: z.array(z.string()),
  recent_commits: z.array(commitEventSchema),
  recent_pushes: z.array(pushEventSchema),
  recent_sessions: z.array(focusSessionSchema),
  language_breakdown: z.array(languageStatSchema),
  top_files: z.array(z.string()),
});

export const sessionSummarySchema = z.object({
  sessions: z.array(focusSessionSchema),
  total_minutes: z.number().int().nonnegative(),
  average_length_minutes: z.number().int().nonnegative(),
  longest_session_minutes: z.number().int().nonnegative(),
});

export const achievementSchema = z.object({
  kind: z.string().min(1),
  unlocked_at: timestampSchema,
  day: daySchema.nullable().optional(),
  reason: z.string().min(1),
});

export const streakSummarySchema = z.object({
  current_days: z.number().int().nonnegative(),
  best_days: z.number().int().nonnegative(),
});

export const achievementsViewSchema = z.object({
  achievements: z.array(achievementSchema),
  streaks: streakSummarySchema,
  today_score: z.number().int(),
});

export const authorIdentitySchema = z.object({
  email: z.string().min(1),
  name: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).optional(),
});

export const goalConfigSchema = z.object({
  changed_lines_per_day: z.number().int().nonnegative(),
  commits_per_day: z.number().int().nonnegative(),
  focus_minutes_per_day: z.number().int().nonnegative(),
});

export const monitoringConfigSchema = z.object({
  import_days: z.number().int().positive(),
  session_gap_minutes: z.number().int().positive(),
  repo_discovery_depth: z.number().int().positive().optional(),
});

export const uiConfigSchema = z.object({
  timezone: z.string().min(1),
  day_boundary_minutes: z.number().int().nonnegative(),
});

export const patternConfigSchema = z.object({
  include: z.array(z.string()),
  exclude: z.array(z.string()),
});

export const githubConfigSchema = z.object({
  enabled: z.boolean(),
  token: z.string().min(1).nullable().optional(),
  verify_remote_pushes: z.boolean(),
});

export const databaseConfigSchema = z.object({
  path: z.string().min(1),
});

export const serverConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
});

export const runtimeConfigSchema = z.object({
  authors: z.array(authorIdentitySchema),
  goals: goalConfigSchema,
  patterns: patternConfigSchema,
  github: githubConfigSchema,
  monitoring: monitoringConfigSchema,
  ui: uiConfigSchema,
  database: databaseConfigSchema.optional(),
  server: serverConfigSchema.optional(),
});

export const appPathsSchema = z.object({
  config_dir: z.string().min(1),
  data_dir: z.string().min(1),
  config_file: z.string().min(1),
});

export const settingsViewSchema = z.object({
  config: runtimeConfigSchema,
  paths: appPathsSchema,
});

export const operatorActionResultSchema = z.object({
  action: manualActionSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  lines: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)).optional(),
});

export const actionPayloadSchema = z.object({
  result: operatorActionResultSchema,
  repositories: z.array(repositorySchema).optional(),
  repository: repositorySchema.nullable().optional(),
  repository_card: repoCardSchema.nullable().optional(),
  settings: settingsViewSchema.nullable().optional(),
});

export const addTargetRequestSchema = z.object({
  path: z.string().min(1),
});

export const importRequestSchema = z.object({
  days: z.number().int().optional(),
});

export const repositoryPatternsRequestSchema = z.object({
  include_patterns: z.array(z.string()),
  exclude_patterns: z.array(z.string()),
});

export const saveSettingsRequestSchema = z.object({
  authors: z.array(z.string()),
  changed_lines_per_day: z.number().int().nonnegative(),
  commits_per_day: z.number().int().nonnegative(),
  focus_minutes_per_day: z.number().int().nonnegative(),
  timezone: z.string(),
  day_boundary_minutes: z.number().int().nonnegative(),
  session_gap_minutes: z.number().int().positive(),
  import_days: z.number().int().positive(),
  include_patterns: z.array(z.string()),
  exclude_patterns: z.array(z.string()),
  github_enabled: z.boolean(),
  github_verify_remote_pushes: z.boolean(),
  github_token: z.string(),
});

export const dashboardResponseSchema = z.object({
  data: dashboardViewSchema,
});

export const repositoriesResponseSchema = z.object({
  data: repositoriesPayloadSchema,
});

export const repoDetailResponseSchema = z.object({
  data: repoDetailViewSchema,
});

export const sessionsResponseSchema = z.object({
  data: sessionSummarySchema,
});

export const achievementsResponseSchema = z.object({
  data: achievementsViewSchema,
});

export const settingsResponseSchema = z.object({
  data: settingsViewSchema,
});

export const actionResponseSchema = z.object({
  data: actionPayloadSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type GoalProgress = z.infer<typeof goalProgressSchema>;
export type TodaySummary = z.infer<typeof todaySummarySchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type ActivityFeedItem = z.infer<typeof activityFeedItemSchema>;
export type LanguageStat = z.infer<typeof languageStatSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type RepoStatusSnapshot = z.infer<typeof repoStatusSnapshotSchema>;
export type DailyRollup = z.infer<typeof dailyRollupSchema>;
export type RepoCard = z.infer<typeof repoCardSchema>;
export type CommitEvent = z.infer<typeof commitEventSchema>;
export type PushEvent = z.infer<typeof pushEventSchema>;
export type FocusSession = z.infer<typeof focusSessionSchema>;
export type DashboardView = z.infer<typeof dashboardViewSchema>;
export type RepositoriesPayload = z.infer<typeof repositoriesPayloadSchema>;
export type RepoDetailView = z.infer<typeof repoDetailViewSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type Achievement = z.infer<typeof achievementSchema>;
export type StreakSummary = z.infer<typeof streakSummarySchema>;
export type AchievementsView = z.infer<typeof achievementsViewSchema>;
export type AuthorIdentity = z.infer<typeof authorIdentitySchema>;
export type GoalConfig = z.infer<typeof goalConfigSchema>;
export type MonitoringConfig = z.infer<typeof monitoringConfigSchema>;
export type UIConfig = z.infer<typeof uiConfigSchema>;
export type PatternConfig = z.infer<typeof patternConfigSchema>;
export type GithubConfig = z.infer<typeof githubConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type AppPaths = z.infer<typeof appPathsSchema>;
export type SettingsView = z.infer<typeof settingsViewSchema>;
export type OperatorActionResult = z.infer<typeof operatorActionResultSchema>;
export type ActionPayload = z.infer<typeof actionPayloadSchema>;
export type AddTargetRequest = z.infer<typeof addTargetRequestSchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type RepositoryPatternsRequest = z.infer<
  typeof repositoryPatternsRequestSchema
>;
export type SaveSettingsRequest = z.infer<typeof saveSettingsRequestSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type RepositoriesResponse = z.infer<typeof repositoriesResponseSchema>;
export type RepoDetailResponse = z.infer<typeof repoDetailResponseSchema>;
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;
export type AchievementsResponse = z.infer<typeof achievementsResponseSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type ActionResponse = z.infer<typeof actionResponseSchema>;
