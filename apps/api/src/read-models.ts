import { join } from 'node:path';

import type { ApiEnv } from '@gitpulse-vnext/config';
import {
  type AchievementsView,
  type ActivityFeedItem,
  authorIdentitySchema,
  type Achievement as ContractAchievement,
  type CommitEvent as ContractCommitEvent,
  type DailyRollup as ContractDailyRollup,
  type FocusSession as ContractFocusSession,
  type PushEvent as ContractPushEvent,
  type RepoStatusSnapshot as ContractRepoStatusSnapshot,
  type Repository as ContractRepository,
  type DashboardView,
  type GoalProgress,
  githubConfigSchema,
  goalConfigSchema,
  monitoringConfigSchema,
  patternConfigSchema,
  type RepoCard,
  type RepoDetailView,
  type RepositoriesPayload,
  type SessionSummary,
  type SettingsView,
  type TrendPoint,
  uiConfigSchema,
} from '@gitpulse-vnext/contracts';
import {
  computeStreaks,
  createPostgresClient,
  createPostgresGitPulseStore,
  type DailyRollup,
  type PostgresGitPulseStore,
  type RepoStatusSnapshot,
  type Repository,
} from '@gitpulse-vnext/core';

const defaultExcludePatterns = [
  '.git/**',
  'target/**',
  'node_modules/**',
  'build/**',
  'dist/**',
  '.next/**',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'go.sum',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.webp',
  '*.mp4',
  '*.mov',
  '*.avi',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.bz2',
  '*.7z',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.wasm',
] as const;

const defaultGoals = {
  changedLinesPerDay: 250,
  commitsPerDay: 3,
  focusMinutesPerDay: 90,
} as const;

const defaultSettingsConfig = {
  authors: [],
  goals: {
    changed_lines_per_day: defaultGoals.changedLinesPerDay,
    commits_per_day: defaultGoals.commitsPerDay,
    focus_minutes_per_day: defaultGoals.focusMinutesPerDay,
  },
  patterns: {
    include: [],
    exclude: [...defaultExcludePatterns],
  },
  github: {
    enabled: false,
    token: null,
    verify_remote_pushes: false,
  },
  monitoring: {
    import_days: 30,
    session_gap_minutes: 15,
    repo_discovery_depth: 5,
  },
  ui: {
    timezone: 'UTC',
    day_boundary_minutes: 0,
  },
} satisfies SettingsView['config'];

function todayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function findRollup(rollups: readonly DailyRollup[], day: string) {
  return rollups.find((rollup) => rollup.day === day) ?? null;
}

function buildTrendPoints(
  rollups: readonly DailyRollup[],
  days: number
): TrendPoint[] {
  const sorted = [...rollups].sort((left, right) =>
    right.day.localeCompare(left.day)
  );
  const points = sorted.slice(0, days).map((rollup) => ({
    day: rollup.day,
    changed_lines: rollup.liveAdditions + rollup.liveDeletions,
    commits: rollup.commits,
    pushes: rollup.pushes,
    focus_minutes: rollup.focusMinutes,
    score: rollup.score,
  }));

  return points.reverse();
}

function buildSparkline(rollups: readonly DailyRollup[], days: number) {
  const values = buildTrendPoints(rollups, days).map((point) => point.score);
  const maxValue = Math.max(1, ...values);

  return values.map((value) => Math.floor((value * 60) / maxValue));
}

function assessHealth(snapshot: RepoStatusSnapshot | null) {
  if (!snapshot) {
    return 'Error' as const;
  }

  if (snapshot.isDetached) {
    return 'Detached HEAD' as const;
  }

  if (!snapshot.upstreamRef) {
    return 'No Upstream' as const;
  }

  return 'Healthy' as const;
}

function computePercent(current: number, target: number) {
  if (target <= 0) {
    return 0;
  }

  return Math.min(100, (current / target) * 100);
}

function buildGoalProgress(
  label: string,
  current: number,
  target: number
): GoalProgress {
  return {
    label,
    current,
    target,
    percent: computePercent(current, target),
  };
}

function mapRepository(repository: Repository): ContractRepository {
  return {
    id: repository.id,
    target_id: repository.targetId,
    name: repository.name,
    root_path: repository.rootPath,
    remote_url: repository.remoteUrl,
    default_branch: repository.defaultBranch,
    include_patterns: [...repository.includePatterns],
    exclude_patterns: [...repository.excludePatterns],
    is_monitored: repository.isMonitored,
    state: repository.state,
    created_at: repository.createdAt.toISOString(),
    updated_at: repository.updatedAt.toISOString(),
    last_error: repository.lastError,
  };
}

function mapSnapshot(
  snapshot: RepoStatusSnapshot | null
): ContractRepoStatusSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id,
    repo_id: snapshot.repoId,
    observed_at: snapshot.observedAt.toISOString(),
    branch: snapshot.branch,
    is_detached: snapshot.isDetached,
    head_sha: snapshot.headSha,
    upstream_ref: snapshot.upstreamRef,
    upstream_head_sha: snapshot.upstreamHeadSha,
    ahead_count: snapshot.aheadCount,
    behind_count: snapshot.behindCount,
    live_additions: snapshot.liveAdditions,
    live_deletions: snapshot.liveDeletions,
    live_files: snapshot.liveFiles,
    staged_additions: snapshot.stagedAdditions,
    staged_deletions: snapshot.stagedDeletions,
    staged_files: snapshot.stagedFiles,
    files_touched: snapshot.filesTouched,
    repo_size_bytes: snapshot.repoSizeBytes,
    language_breakdown: snapshot.languageBreakdown.map((language) => ({
      language: language.language,
      code: language.code,
      comments: language.comments,
      blanks: language.blanks,
    })),
  };
}

function mapDailyRollup(
  rollup: DailyRollup | null
): ContractDailyRollup | null {
  if (!rollup) {
    return null;
  }

  return {
    scope: rollup.scope,
    day: rollup.day,
    live_additions: rollup.liveAdditions,
    live_deletions: rollup.liveDeletions,
    staged_additions: rollup.stagedAdditions,
    staged_deletions: rollup.stagedDeletions,
    committed_additions: rollup.committedAdditions,
    committed_deletions: rollup.committedDeletions,
    commits: rollup.commits,
    pushes: rollup.pushes,
    focus_minutes: rollup.focusMinutes,
    files_touched: rollup.filesTouched,
    languages_touched: rollup.languagesTouched,
    score: rollup.score,
  };
}

function mapActivityFeedItem(item: {
  kind: 'commit' | 'push' | 'file_change';
  repoName: string;
  timestamp: Date;
  detail: string;
}): ActivityFeedItem {
  return {
    kind: item.kind,
    repo_name: item.repoName,
    timestamp: item.timestamp.toISOString(),
    detail: item.detail,
  };
}

function mapCommit(commit: {
  id: string;
  repoId: string;
  commitSha: string;
  authoredAt: Date;
  authorName: string | null;
  authorEmail: string | null;
  summary: string;
  branch: string | null;
  additions: number;
  deletions: number;
  filesChanged: number;
  isMerge: boolean;
  importedAt: Date;
}): ContractCommitEvent {
  return {
    id: commit.id,
    repo_id: commit.repoId,
    commit_sha: commit.commitSha,
    authored_at: commit.authoredAt.toISOString(),
    author_name: commit.authorName,
    author_email: commit.authorEmail,
    summary: commit.summary,
    branch: commit.branch,
    additions: commit.additions,
    deletions: commit.deletions,
    files_changed: commit.filesChanged,
    is_merge: commit.isMerge,
    imported_at: commit.importedAt.toISOString(),
  };
}

function mapPush(push: {
  id: string;
  repoId: string;
  observedAt: Date;
  kind: 'push_detected_local' | 'push_remote_confirmed';
  headSha: string | null;
  pushedCommitCount: number;
  upstreamRef: string | null;
  notes: string | null;
}): ContractPushEvent {
  return {
    id: push.id,
    repo_id: push.repoId,
    observed_at: push.observedAt.toISOString(),
    kind: push.kind,
    head_sha: push.headSha,
    pushed_commit_count: push.pushedCommitCount,
    upstream_ref: push.upstreamRef,
    notes: push.notes,
  };
}

function mapFocusSession(session: {
  id: string;
  startedAt: Date;
  endedAt: Date;
  activeMinutes: number;
  repoIds: string[];
  eventCount: number;
  totalChangedLines: number;
}): ContractFocusSession {
  return {
    id: session.id,
    started_at: session.startedAt.toISOString(),
    ended_at: session.endedAt.toISOString(),
    active_minutes: session.activeMinutes,
    repo_ids: [...session.repoIds],
    event_count: session.eventCount,
    total_changed_lines: session.totalChangedLines,
  };
}

function mapAchievement(achievement: {
  kind: string;
  unlockedAt: Date;
  day: string | null;
  reason: string;
}): ContractAchievement {
  return {
    kind: achievement.kind,
    unlocked_at: achievement.unlockedAt.toISOString(),
    day: achievement.day,
    reason: achievement.reason,
  };
}

async function buildRepoCard(
  store: PostgresGitPulseStore,
  repository: Repository,
  day: string
): Promise<RepoCard> {
  const [snapshot, rollups] = await Promise.all([
    store.latestSnapshot(repository.id),
    store.allRollupsForScope(repository.id),
  ]);

  return {
    repo: mapRepository(repository),
    snapshot: mapSnapshot(snapshot),
    health: assessHealth(snapshot),
    metrics: mapDailyRollup(findRollup(rollups, day)),
    sparkline: buildSparkline(rollups, 7),
  };
}

async function buildRepositoryCards(
  store: PostgresGitPulseStore,
  now: Date
): Promise<RepoCard[]> {
  const repositories = await store.listRepositories();
  const day = todayKey(now);

  return Promise.all(
    repositories
      .filter((repository) => repository.state !== 'removed')
      .map((repository) => buildRepoCard(store, repository, day))
  );
}

function mergeSettings(
  records: Awaited<ReturnType<PostgresGitPulseStore['listSettings']>>,
  env: ApiEnv
): SettingsView {
  const config: SettingsView['config'] = {
    authors: [...defaultSettingsConfig.authors],
    goals: { ...defaultSettingsConfig.goals },
    patterns: {
      include: [...defaultSettingsConfig.patterns.include],
      exclude: [...defaultSettingsConfig.patterns.exclude],
    },
    github: { ...defaultSettingsConfig.github },
    monitoring: { ...defaultSettingsConfig.monitoring },
    ui: { ...defaultSettingsConfig.ui },
  };

  for (const record of records) {
    switch (record.key) {
      case 'authors': {
        const parsed = authorIdentitySchema.array().safeParse(record.valueJson);
        if (parsed.success) {
          config.authors = parsed.data;
        }
        break;
      }
      case 'goals': {
        const parsed = goalConfigSchema.partial().safeParse(record.valueJson);
        if (parsed.success) {
          config.goals = {
            ...config.goals,
            ...parsed.data,
          };
        }
        break;
      }
      case 'patterns': {
        const parsed = patternConfigSchema
          .partial()
          .safeParse(record.valueJson);
        if (parsed.success) {
          config.patterns = {
            ...config.patterns,
            ...parsed.data,
            include: parsed.data.include ?? config.patterns.include,
            exclude: parsed.data.exclude ?? config.patterns.exclude,
          };
        }
        break;
      }
      case 'github': {
        const parsed = githubConfigSchema.partial().safeParse(record.valueJson);
        if (parsed.success) {
          config.github = {
            ...config.github,
            ...parsed.data,
          };
        }
        break;
      }
      case 'monitoring': {
        const parsed = monitoringConfigSchema
          .partial()
          .safeParse(record.valueJson);
        if (parsed.success) {
          config.monitoring = {
            ...config.monitoring,
            ...parsed.data,
          };
        }
        break;
      }
      case 'ui': {
        const parsed = uiConfigSchema.partial().safeParse(record.valueJson);
        if (parsed.success) {
          config.ui = {
            ...config.ui,
            ...parsed.data,
          };
        }
        break;
      }
    }
  }

  return {
    config,
    paths: {
      config_dir: env.GITPULSE_CONFIG_DIR,
      data_dir: env.GITPULSE_DATA_DIR,
      config_file: join(env.GITPULSE_CONFIG_DIR, 'gitpulse.toml'),
    },
  };
}

export interface ApiReadModels {
  getDashboard(): Promise<DashboardView>;
  getRepositories(): Promise<RepositoriesPayload>;
  getRepositoryDetail(selector: string): Promise<RepoDetailView | null>;
  getSessions(): Promise<SessionSummary>;
  getAchievements(): Promise<AchievementsView>;
  getSettings(): Promise<SettingsView>;
}

export function createApiReadModels(
  store: PostgresGitPulseStore,
  env: ApiEnv,
  options: { now?: () => Date } = {}
): ApiReadModels {
  const nowFactory = options.now ?? (() => new Date());

  return {
    async getDashboard() {
      const now = nowFactory();
      const day = todayKey(now);
      const [allRollups, feed, repoCards, settings] = await Promise.all([
        store.allRollupsForScope('all'),
        store.recentActivityFeed(20),
        buildRepositoryCards(store, now),
        store.listSettings().then((records) => mergeSettings(records, env)),
      ]);

      const todayRollup = findRollup(allRollups, day);
      const streaks = computeStreaks(allRollups, now);
      const liveLines = todayRollup
        ? todayRollup.liveAdditions + todayRollup.liveDeletions
        : 0;
      const stagedLines = todayRollup
        ? todayRollup.stagedAdditions + todayRollup.stagedDeletions
        : 0;
      const commitsToday = todayRollup?.commits ?? 0;
      const pushesToday = todayRollup?.pushes ?? 0;
      const focusToday = todayRollup?.focusMinutes ?? 0;
      const todayScore = todayRollup?.score ?? 0;

      return {
        summary: {
          live_lines: liveLines,
          staged_lines: stagedLines,
          commits_today: commitsToday,
          pushes_today: pushesToday,
          active_session_minutes: focusToday,
          streak_days: streaks.currentDays,
          best_streak_days: streaks.bestDays,
          today_score: todayScore,
          goals: [
            buildGoalProgress(
              'Changed Lines',
              liveLines,
              settings.config.goals.changed_lines_per_day
            ),
            buildGoalProgress(
              'Commits',
              commitsToday,
              settings.config.goals.commits_per_day
            ),
            buildGoalProgress(
              'Focus Minutes',
              focusToday,
              settings.config.goals.focus_minutes_per_day
            ),
          ],
        },
        activity_feed: feed.map(mapActivityFeedItem),
        trend_points: buildTrendPoints(allRollups, 30),
        heatmap_days: buildTrendPoints(allRollups, 84),
        repo_cards: repoCards,
      };
    },

    async getRepositories() {
      return {
        repositories: await buildRepositoryCards(store, nowFactory()),
      };
    },

    async getRepositoryDetail(selector: string) {
      const repository = await store.findRepository(selector);
      if (!repository) {
        return null;
      }

      const day = todayKey(nowFactory());
      const [card, commits, pushes, sessions, snapshot, topFiles] =
        await Promise.all([
          buildRepoCard(store, repository, day),
          store.listCommits(repository.id, 20),
          store.listPushEvents(repository.id, 10),
          store.listFocusSessions(200),
          store.latestSnapshot(repository.id),
          store.topFilesTouched(repository.id, 12),
        ]);

      const recentSessions = sessions
        .filter((session) => session.repoIds.includes(repository.id))
        .slice(0, 10)
        .map(mapFocusSession);

      return {
        card,
        include_patterns: [...repository.includePatterns],
        exclude_patterns: [...repository.excludePatterns],
        recent_commits: commits.map(mapCommit),
        recent_pushes: pushes.map(mapPush),
        recent_sessions: recentSessions,
        language_breakdown: mapSnapshot(snapshot)?.language_breakdown ?? [],
        top_files: topFiles,
      };
    },

    async getSessions() {
      const sessions = await store.listFocusSessions(50);
      const sessionViews = sessions.map(mapFocusSession);
      const totalMinutes = sessions.reduce(
        (total, session) => total + session.activeMinutes,
        0
      );
      const longestSessionMinutes = sessions.reduce(
        (longest, session) => Math.max(longest, session.activeMinutes),
        0
      );

      return {
        sessions: sessionViews,
        total_minutes: totalMinutes,
        average_length_minutes:
          sessions.length === 0
            ? 0
            : Math.floor(totalMinutes / sessions.length),
        longest_session_minutes: longestSessionMinutes,
      };
    },

    async getAchievements() {
      const now = nowFactory();
      const day = todayKey(now);
      const [achievements, allRollups] = await Promise.all([
        store.listAchievements(),
        store.allRollupsForScope('all'),
      ]);
      const streaks = computeStreaks(allRollups, now);
      const todayRollup = findRollup(allRollups, day);

      return {
        achievements: achievements.map(mapAchievement),
        streaks: {
          current_days: streaks.currentDays,
          best_days: streaks.bestDays,
        },
        today_score: todayRollup?.score ?? 0,
      };
    },

    async getSettings() {
      return mergeSettings(await store.listSettings(), env);
    },
  };
}

export function createPostgresApiReadModels(
  env: ApiEnv,
  options: { now?: () => Date } = {}
): ApiReadModels {
  const sql = createPostgresClient(env.GITPULSE_DATABASE_URL);
  const store = createPostgresGitPulseStore(sql);
  return createApiReadModels(store, env, options);
}
