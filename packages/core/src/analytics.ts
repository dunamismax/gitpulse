import type {
  Achievement,
  CommitEvent,
  DailyRollup,
  FileActivityEvent,
  FocusSession,
  PushEvent,
  RepoStatusSnapshot,
  Repository,
} from './domain';

const achievementKindsInOrder = [
  'first_repo',
  'first_commit_tracked',
  'first_push_detected',
  'lines_100',
  'lines_1000',
  'commits_5',
  'refactorer',
  'polyglot',
  'focus_50',
] as const;

const defaultScoreFormula = {
  liveLineUnit: 20,
  commitBonus: 50,
  pushBonus: 80,
  focusMinuteUnit: 2,
} as const;

type AchievementKind = (typeof achievementKindsInOrder)[number];

export interface AnalyticsStore {
  listRepositories(): Promise<Repository[]>;
  allSnapshotsForAnalytics(): Promise<RepoStatusSnapshot[]>;
  allCommitsForAnalytics(): Promise<CommitEvent[]>;
  allPushEventsForAnalytics(): Promise<PushEvent[]>;
  allFileActivityForAnalytics(): Promise<FileActivityEvent[]>;
  replaceFocusSessions(sessions: readonly FocusSession[]): Promise<unknown>;
  replaceDailyRollups(rollups: readonly DailyRollup[]): Promise<unknown>;
  replaceAchievements(achievements: readonly Achievement[]): Promise<unknown>;
}

export interface RebuildAnalyticsOptions {
  sessionGapMinutes?: number;
  timezone?: string;
  dayBoundaryMinutes?: number;
  now?: Date;
  idGenerator?: () => string;
}

export interface RebuildAnalyticsReport {
  scannedRepositories: number;
  scannedSnapshots: number;
  scannedCommits: number;
  scannedPushEvents: number;
  scannedFileActivityEvents: number;
  sessionsWritten: number;
  rollupsWritten: number;
  achievementsWritten: number;
}

export interface StreakSummary {
  currentDays: number;
  bestDays: number;
}

interface ActivityPoint {
  repoId: string;
  observedAt: Date;
  changedLines: number;
}

interface RollupAccumulator {
  liveAdditions: number;
  liveDeletions: number;
  stagedAdditions: number;
  stagedDeletions: number;
  committedAdditions: number;
  committedDeletions: number;
  commits: number;
  pushes: number;
  filesTouched: Set<string>;
  languagesTouched: Set<string>;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isInteger(value) || value == null || value <= 0) {
    return fallback;
  }

  return value;
}

function normalizeInteger(value: number | undefined, fallback: number) {
  if (!Number.isInteger(value) || value == null) {
    return fallback;
  }

  return value;
}

function createRollupAccumulator(): RollupAccumulator {
  return {
    liveAdditions: 0,
    liveDeletions: 0,
    stagedAdditions: 0,
    stagedDeletions: 0,
    committedAdditions: 0,
    committedDeletions: 0,
    commits: 0,
    pushes: 0,
    filesTouched: new Set<string>(),
    languagesTouched: new Set<string>(),
  };
}

function loadFormatter(timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}

function formatDay(
  value: Date,
  formatter: Intl.DateTimeFormat,
  dayBoundaryMinutes: number
) {
  const shifted = new Date(value.getTime() - dayBoundaryMinutes * 60_000);
  const parts = formatter.formatToParts(shifted);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('failed to format rollup day');
  }

  return `${year}-${month}-${day}`;
}

function rollupKey(scope: string, day: string) {
  return `${scope}::${day}`;
}

function getOrCreateAccumulator(
  accumulators: Map<string, RollupAccumulator>,
  scope: string,
  day: string
) {
  const key = rollupKey(scope, day);
  const existing = accumulators.get(key);
  if (existing) {
    return existing;
  }

  const created = createRollupAccumulator();
  accumulators.set(key, created);
  return created;
}

function buildActivityPoints(
  commits: readonly CommitEvent[],
  fileActivityEvents: readonly FileActivityEvent[],
  activeRepositoryIds: ReadonlySet<string>
) {
  const points: ActivityPoint[] = [];

  for (const commit of commits) {
    if (!activeRepositoryIds.has(commit.repoId)) {
      continue;
    }

    points.push({
      repoId: commit.repoId,
      observedAt: commit.authoredAt,
      changedLines: commit.additions + commit.deletions,
    });
  }

  for (const event of fileActivityEvents) {
    if (!activeRepositoryIds.has(event.repoId)) {
      continue;
    }

    points.push({
      repoId: event.repoId,
      observedAt: event.observedAt,
      changedLines: event.additions + event.deletions,
    });
  }

  return points;
}

export function sessionizeActivity(
  events: readonly ActivityPoint[],
  gapMinutes: number,
  options: Pick<RebuildAnalyticsOptions, 'idGenerator'> = {}
): FocusSession[] {
  const idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  if (events.length === 0) {
    return [];
  }

  const sorted = [...events].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime()
  );
  const gapMs = normalizePositiveInteger(gapMinutes, 15) * 60_000;

  const sessions: FocusSession[] = [];
  let windowStart = sorted[0].observedAt;
  let windowEnd = sorted[0].observedAt;
  let repoIds = new Set([sorted[0].repoId]);
  let eventCount = 1;
  let totalChangedLines = sorted[0].changedLines;

  const flush = () => {
    const activeMinutes = Math.max(
      1,
      Math.floor((windowEnd.getTime() - windowStart.getTime()) / 60_000)
    );

    sessions.push({
      id: idGenerator(),
      startedAt: new Date(windowStart.getTime()),
      endedAt: new Date(windowEnd.getTime()),
      activeMinutes,
      repoIds: [...repoIds].sort(),
      eventCount,
      totalChangedLines,
    });
  };

  for (const event of sorted.slice(1)) {
    if (event.observedAt.getTime() - windowEnd.getTime() > gapMs) {
      flush();
      windowStart = event.observedAt;
      windowEnd = event.observedAt;
      repoIds = new Set([event.repoId]);
      eventCount = 1;
      totalChangedLines = event.changedLines;
      continue;
    }

    windowEnd = event.observedAt;
    repoIds.add(event.repoId);
    eventCount += 1;
    totalChangedLines += event.changedLines;
  }

  flush();
  return sessions;
}

export function computeScore(rollup: DailyRollup) {
  return (
    Math.floor(
      (rollup.liveAdditions + rollup.liveDeletions) /
        defaultScoreFormula.liveLineUnit
    ) +
    rollup.commits * defaultScoreFormula.commitBonus +
    rollup.pushes * defaultScoreFormula.pushBonus +
    rollup.focusMinutes * defaultScoreFormula.focusMinuteUnit
  );
}

export function qualifiesAsActiveDay(rollup: DailyRollup) {
  return (
    rollup.commits > 0 ||
    rollup.liveAdditions + rollup.liveDeletions >= 100 ||
    rollup.focusMinutes >= 25
  );
}

export function computeStreaks(
  rollups: readonly DailyRollup[],
  asOf = new Date()
): StreakSummary {
  const qualifyingDays = new Set<string>();
  for (const rollup of rollups) {
    if (qualifiesAsActiveDay(rollup)) {
      qualifyingDays.add(rollup.day);
    }
  }

  if (qualifyingDays.size === 0) {
    return { currentDays: 0, bestDays: 0 };
  }

  const today = asOf.toISOString().slice(0, 10);
  const yesterday = new Date(asOf.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  let currentDays = 0;
  if (qualifyingDays.has(today) || qualifyingDays.has(yesterday)) {
    let cursor = new Date(asOf.getTime());
    if (!qualifyingDays.has(today)) {
      cursor = new Date(cursor.getTime() - 86_400_000);
    }

    while (qualifyingDays.has(cursor.toISOString().slice(0, 10))) {
      currentDays += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }
  }

  const sortedDays = [...qualifyingDays].sort().reverse();
  let bestDays = 0;
  let run = 0;
  let previousDay: string | null = null;

  for (const day of sortedDays) {
    if (!previousDay) {
      run = 1;
    } else {
      const previousTime = Date.parse(`${previousDay}T00:00:00Z`);
      const currentTime = Date.parse(`${day}T00:00:00Z`);
      run = previousTime - currentTime === 86_400_000 ? run + 1 : 1;
    }

    bestDays = Math.max(bestDays, run);
    previousDay = day;
  }

  return { currentDays, bestDays };
}

export function evaluateAchievements({
  repoCount,
  totalPushes,
  rollups,
  sessions,
  now = new Date(),
}: {
  repoCount: number;
  totalPushes: number;
  rollups: readonly DailyRollup[];
  sessions: readonly FocusSession[];
  now?: Date;
}): Achievement[] {
  const earned = new Map<AchievementKind, Achievement>();

  const maybeAdd = (
    kind: AchievementKind,
    day: string | null,
    reason: string
  ) => {
    if (earned.has(kind)) {
      return;
    }

    earned.set(kind, {
      kind,
      unlockedAt: new Date(now.getTime()),
      day,
      reason,
    });
  };

  if (repoCount >= 1) {
    maybeAdd('first_repo', null, 'First repository added');
  }

  for (const rollup of rollups) {
    if (rollup.commits > 0) {
      maybeAdd('first_commit_tracked', rollup.day, 'First commit tracked');
    }

    const liveChangedLines = rollup.liveAdditions + rollup.liveDeletions;
    if (liveChangedLines >= 100) {
      maybeAdd('lines_100', rollup.day, '100+ live line changes in a day');
    }
    if (liveChangedLines >= 1000) {
      maybeAdd('lines_1000', rollup.day, '1000+ live line changes in a day');
    }

    if (rollup.commits >= 5) {
      maybeAdd('commits_5', rollup.day, '5+ commits in a day');
    }

    const committedChangedLines =
      rollup.committedAdditions + rollup.committedDeletions;
    if (
      rollup.committedDeletions > rollup.committedAdditions &&
      committedChangedLines >= 200
    ) {
      maybeAdd(
        'refactorer',
        rollup.day,
        'Major refactor: more deletions than additions'
      );
    }

    if (rollup.languagesTouched >= 3) {
      maybeAdd('polyglot', rollup.day, '3+ languages touched in a day');
    }
  }

  if (totalPushes > 0) {
    maybeAdd('first_push_detected', null, 'First push detected');
  }

  for (const session of sessions) {
    if (session.activeMinutes >= 50) {
      maybeAdd('focus_50', null, '50+ minute focus session');
      break;
    }
  }

  return achievementKindsInOrder.flatMap((kind) => {
    const achievement = earned.get(kind);
    return achievement ? [achievement] : [];
  });
}

export async function rebuildAnalytics(
  store: AnalyticsStore,
  options: RebuildAnalyticsOptions = {}
): Promise<RebuildAnalyticsReport> {
  const sessionGapMinutes = normalizePositiveInteger(
    options.sessionGapMinutes,
    15
  );
  const timezone = options.timezone ?? 'UTC';
  const dayBoundaryMinutes = normalizeInteger(options.dayBoundaryMinutes, 0);
  const now = options.now ?? new Date();
  const idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  const dayFormatter = loadFormatter(timezone);

  const [repositories, snapshots, commits, pushEvents, fileActivityEvents] =
    await Promise.all([
      store.listRepositories(),
      store.allSnapshotsForAnalytics(),
      store.allCommitsForAnalytics(),
      store.allPushEventsForAnalytics(),
      store.allFileActivityForAnalytics(),
    ]);

  const activeRepositoryIds = new Set(
    repositories
      .filter((repository) => repository.state !== 'removed')
      .map((repository) => repository.id)
  );

  const accumulators = new Map<string, RollupAccumulator>();

  const sortedSnapshots = [...snapshots].sort((left, right) => {
    if (left.repoId !== right.repoId) {
      return left.repoId.localeCompare(right.repoId);
    }

    return left.observedAt.getTime() - right.observedAt.getTime();
  });

  for (const snapshot of sortedSnapshots) {
    if (!activeRepositoryIds.has(snapshot.repoId)) {
      continue;
    }

    const day = formatDay(
      snapshot.observedAt,
      dayFormatter,
      dayBoundaryMinutes
    );
    for (const scope of [snapshot.repoId, 'all']) {
      const accumulator = getOrCreateAccumulator(accumulators, scope, day);
      accumulator.liveAdditions = snapshot.liveAdditions;
      accumulator.liveDeletions = snapshot.liveDeletions;
      accumulator.stagedAdditions = snapshot.stagedAdditions;
      accumulator.stagedDeletions = snapshot.stagedDeletions;
      for (const language of snapshot.languageBreakdown) {
        accumulator.languagesTouched.add(language.language);
      }
    }
  }

  for (const commit of commits) {
    if (!activeRepositoryIds.has(commit.repoId)) {
      continue;
    }

    const day = formatDay(commit.authoredAt, dayFormatter, dayBoundaryMinutes);
    for (const scope of [commit.repoId, 'all']) {
      const accumulator = getOrCreateAccumulator(accumulators, scope, day);
      accumulator.committedAdditions += commit.additions;
      accumulator.committedDeletions += commit.deletions;
      accumulator.commits += 1;
    }
  }

  for (const pushEvent of pushEvents) {
    if (
      !activeRepositoryIds.has(pushEvent.repoId) ||
      pushEvent.kind !== 'push_detected_local'
    ) {
      continue;
    }

    const day = formatDay(
      pushEvent.observedAt,
      dayFormatter,
      dayBoundaryMinutes
    );
    for (const scope of [pushEvent.repoId, 'all']) {
      const accumulator = getOrCreateAccumulator(accumulators, scope, day);
      accumulator.pushes += 1;
    }
  }

  for (const event of fileActivityEvents) {
    if (!activeRepositoryIds.has(event.repoId)) {
      continue;
    }

    const day = formatDay(event.observedAt, dayFormatter, dayBoundaryMinutes);
    for (const scope of [event.repoId, 'all']) {
      getOrCreateAccumulator(accumulators, scope, day).filesTouched.add(
        event.relativePath
      );
    }
  }

  const sessions = sessionizeActivity(
    buildActivityPoints(commits, fileActivityEvents, activeRepositoryIds),
    sessionGapMinutes,
    { idGenerator }
  );

  const focusMinutesByDay = new Map<string, number>();
  for (const session of sessions) {
    const day = formatDay(session.startedAt, dayFormatter, dayBoundaryMinutes);
    for (const repoId of session.repoIds) {
      if (!activeRepositoryIds.has(repoId)) {
        continue;
      }

      getOrCreateAccumulator(accumulators, repoId, day);
    }

    getOrCreateAccumulator(accumulators, 'all', day);
    focusMinutesByDay.set(
      day,
      (focusMinutesByDay.get(day) ?? 0) + session.activeMinutes
    );
  }

  const rollups = [...accumulators.entries()]
    .map(([key, accumulator]) => {
      const [scope, day] = key.split('::');
      const rollup: DailyRollup = {
        scope,
        day,
        liveAdditions: accumulator.liveAdditions,
        liveDeletions: accumulator.liveDeletions,
        stagedAdditions: accumulator.stagedAdditions,
        stagedDeletions: accumulator.stagedDeletions,
        committedAdditions: accumulator.committedAdditions,
        committedDeletions: accumulator.committedDeletions,
        commits: accumulator.commits,
        pushes: accumulator.pushes,
        focusMinutes: scope === 'all' ? (focusMinutesByDay.get(day) ?? 0) : 0,
        filesTouched: accumulator.filesTouched.size,
        languagesTouched: accumulator.languagesTouched.size,
        score: 0,
      };

      rollup.score = computeScore(rollup);
      return rollup;
    })
    .sort(
      (left, right) =>
        left.scope.localeCompare(right.scope) ||
        left.day.localeCompare(right.day)
    );

  const achievements = evaluateAchievements({
    repoCount: activeRepositoryIds.size,
    totalPushes: pushEvents.filter(
      (pushEvent) => pushEvent.kind === 'push_detected_local'
    ).length,
    rollups: rollups.filter((rollup) => rollup.scope === 'all'),
    sessions,
    now,
  });

  await store.replaceFocusSessions(sessions);
  await store.replaceDailyRollups(rollups);
  await store.replaceAchievements(achievements);

  return {
    scannedRepositories: repositories.length,
    scannedSnapshots: snapshots.length,
    scannedCommits: commits.length,
    scannedPushEvents: pushEvents.length,
    scannedFileActivityEvents: fileActivityEvents.length,
    sessionsWritten: sessions.length,
    rollupsWritten: rollups.length,
    achievementsWritten: achievements.length,
  };
}
