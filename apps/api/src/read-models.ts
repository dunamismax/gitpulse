import type { ApiEnv } from '@gitpulse-vnext/config';
import type {
  ActivityFeedItem,
  DailyRollup as ContractDailyRollup,
  RepoStatusSnapshot as ContractRepoStatusSnapshot,
  Repository as ContractRepository,
  DashboardView,
  GoalProgress,
  RepoCard,
  RepositoriesPayload,
  TrendPoint,
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

const defaultGoals = {
  changedLinesPerDay: 250,
  commitsPerDay: 3,
  focusMinutesPerDay: 90,
} as const;

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

export interface ApiReadModels {
  getDashboard(): Promise<DashboardView>;
  getRepositories(): Promise<RepositoriesPayload>;
}

export function createApiReadModels(
  store: PostgresGitPulseStore,
  options: { now?: () => Date } = {}
): ApiReadModels {
  const nowFactory = options.now ?? (() => new Date());

  return {
    async getDashboard() {
      const now = nowFactory();
      const day = todayKey(now);
      const [allRollups, feed, repoCards] = await Promise.all([
        store.allRollupsForScope('all'),
        store.recentActivityFeed(20),
        buildRepositoryCards(store, now),
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
              defaultGoals.changedLinesPerDay
            ),
            buildGoalProgress(
              'Commits',
              commitsToday,
              defaultGoals.commitsPerDay
            ),
            buildGoalProgress(
              'Focus Minutes',
              focusToday,
              defaultGoals.focusMinutesPerDay
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
  };
}

export function createPostgresApiReadModels(
  env: ApiEnv,
  options: { now?: () => Date } = {}
): ApiReadModels {
  const sql = createPostgresClient(env.GITPULSE_DATABASE_URL);
  const store = createPostgresGitPulseStore(sql);
  return createApiReadModels(store, options);
}
