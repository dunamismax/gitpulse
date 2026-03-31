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

export const dashboardResponseSchema = z.object({
  data: dashboardViewSchema,
});

export const repositoriesResponseSchema = z.object({
  data: repositoriesPayloadSchema,
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
export type DashboardView = z.infer<typeof dashboardViewSchema>;
export type RepositoriesPayload = z.infer<typeof repositoriesPayloadSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type RepositoriesResponse = z.infer<typeof repositoriesResponseSchema>;
