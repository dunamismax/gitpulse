import { z } from "zod";

async function fetchJSON<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the HTTP status text
    }
    throw new Error(message);
  }

  const json: unknown = await response.json();
  return schema.parse(json);
}

async function postJSON(url: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as { error?: string };
      if (errorBody.error) message = errorBody.error;
    } catch {
      // keep the HTTP status text
    }
    throw new Error(message);
  }
}

// --- Schemas ---

const GoalProgressSchema = z.object({
  label: z.string(),
  current: z.number(),
  target: z.number(),
  percent: z.number(),
});

const TodaySummarySchema = z.object({
  live_lines: z.number(),
  staged_lines: z.number(),
  commits_today: z.number(),
  pushes_today: z.number(),
  active_session_minutes: z.number(),
  streak_days: z.number(),
  best_streak_days: z.number(),
  today_score: z.number(),
  goals: z.array(GoalProgressSchema),
});

const TrendPointSchema = z.object({
  day: z.string(),
  changed_lines: z.number(),
  score: z.number(),
});

const ActivityFeedItemSchema = z.object({
  kind: z.string(),
  repo_name: z.string(),
  timestamp: z.string(),
  detail: z.string(),
});

const DailyRollupSchema = z.object({
  commits: z.number(),
  pushes: z.number(),
  files_touched: z.number(),
  score: z.number(),
});

const SnapshotSchema = z
  .object({
    branch: z.string().nullable().optional(),
    upstream_ref: z.string().nullable().optional(),
    live_additions: z.number(),
    live_deletions: z.number(),
    staged_additions: z.number(),
    staged_deletions: z.number(),
  })
  .nullable()
  .optional();

const RepoSchema = z.object({
  id: z.string(),
  name: z.string(),
  root_path: z.string(),
  is_monitored: z.boolean(),
});

const RepositoryCardSchema = z.object({
  repo: RepoSchema,
  health: z.string(),
  metrics: DailyRollupSchema.nullable().optional(),
  sparkline: z.array(z.number()),
  snapshot: SnapshotSchema,
});

const DashboardResponseSchema = z.object({
  summary: TodaySummarySchema,
  trend_points: z.array(TrendPointSchema),
  heatmap_days: z.array(TrendPointSchema),
  activity_feed: z.array(ActivityFeedItemSchema),
  repo_cards: z.array(RepositoryCardSchema),
});

const LanguageStatSchema = z.object({
  language: z.string(),
  code: z.number(),
});

const CommitEventSchema = z.object({
  id: z.string(),
  commit_sha: z.string(),
  summary: z.string(),
  additions: z.number(),
  deletions: z.number(),
  authored_at: z.string(),
});

const FocusSessionSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  active_minutes: z.number(),
  total_changed_lines: z.number(),
});

const RepoDetailViewSchema = z.object({
  card: RepositoryCardSchema,
  include_patterns: z.array(z.string()),
  exclude_patterns: z.array(z.string()),
  recent_commits: z.array(CommitEventSchema),
  recent_sessions: z.array(FocusSessionSchema),
  language_breakdown: z.array(LanguageStatSchema),
  top_files: z.array(z.string()),
});

const SessionSummarySchema = z.object({
  sessions: z.array(FocusSessionSchema),
  total_minutes: z.number(),
  average_length_minutes: z.number(),
  longest_session_minutes: z.number(),
});

const AchievementSchema = z.object({
  kind: z.string(),
  reason: z.string(),
  unlocked_at: z.string(),
  day: z.string().nullable().optional(),
});

const StreakSummarySchema = z.object({
  current_days: z.number(),
  best_days: z.number(),
});

const AchievementsResponseSchema = z.object({
  achievements: z.array(AchievementSchema),
  streaks: StreakSummarySchema,
  today_score: z.number(),
});

const SettingsResponseSchema = z.object({
  config: z.object({
    authors: z.array(z.object({ email: z.string() })),
    goals: z.object({
      changed_lines_per_day: z.number(),
      commits_per_day: z.number(),
      focus_minutes_per_day: z.number(),
    }),
    monitoring: z.object({
      session_gap_minutes: z.number(),
      import_days: z.number(),
    }),
    ui: z.object({
      timezone: z.string(),
      day_boundary_minutes: z.number(),
    }),
    patterns: z.object({
      include: z.array(z.string()),
      exclude: z.array(z.string()),
    }),
    github: z.object({
      enabled: z.boolean(),
      verify_remote_pushes: z.boolean(),
    }),
  }),
  paths: z.object({
    config_file: z.string(),
    config_dir: z.string(),
    data_dir: z.string(),
  }),
});

// --- Exported types (derived from Zod) ---

export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
export type TodaySummary = z.infer<typeof TodaySummarySchema>;
export type TrendPoint = z.infer<typeof TrendPointSchema>;
export type ActivityFeedItem = z.infer<typeof ActivityFeedItemSchema>;
export type RepositoryCard = z.infer<typeof RepositoryCardSchema>;
export type RepoDetailView = z.infer<typeof RepoDetailViewSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type AchievementsResponse = z.infer<typeof AchievementsResponseSchema>;
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;
export type GoalProgress = z.infer<typeof GoalProgressSchema>;
export type FocusSession = z.infer<typeof FocusSessionSchema>;
export type CommitEvent = z.infer<typeof CommitEventSchema>;
export type LanguageStat = z.infer<typeof LanguageStatSchema>;

// --- Query functions ---

export function fetchDashboard() {
  return fetchJSON("/api/dashboard", DashboardResponseSchema);
}

export function fetchRepositories() {
  return fetchJSON("/api/repositories", z.array(RepositoryCardSchema));
}

export function fetchRepoDetail(id: string) {
  return fetchJSON(`/api/repositories/${id}`, RepoDetailViewSchema);
}

export function fetchSessions() {
  return fetchJSON("/api/sessions", SessionSummarySchema);
}

export function fetchAchievements() {
  return fetchJSON("/api/achievements", AchievementsResponseSchema);
}

export function fetchSettings() {
  return fetchJSON("/api/settings", SettingsResponseSchema);
}

// --- Mutation functions ---

export function addTarget(path: string) {
  return postJSON("/api/repositories/add", { path });
}

export function refreshRepo(id: string) {
  return postJSON(`/api/repositories/${id}/refresh`);
}

export function toggleRepo(id: string) {
  return postJSON(`/api/repositories/${id}/toggle`);
}

export function removeRepo(id: string) {
  return postJSON(`/api/repositories/${id}/remove`);
}

export function saveRepoPatterns(id: string, includePatterns: string[], excludePatterns: string[]) {
  return postJSON(`/api/repositories/${id}/patterns`, {
    include_patterns: includePatterns,
    exclude_patterns: excludePatterns,
  });
}

export function saveSettings(data: {
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
}) {
  return postJSON("/api/settings", data);
}
