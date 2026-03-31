import { describe, expect, test } from 'bun:test';
import {
  computeStreaks,
  rebuildAnalytics,
  sessionizeActivity,
} from '../src/analytics';
import type {
  Achievement,
  CommitEvent,
  DailyRollup,
  FileActivityEvent,
  FocusSession,
  PushEvent,
  RepoStatusSnapshot,
  Repository,
} from '../src/domain';

function createRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-1',
    targetId: null,
    name: 'gitpulse',
    rootPath: '/tmp/gitpulse',
    remoteUrl: null,
    defaultBranch: 'main',
    includePatterns: [],
    excludePatterns: [],
    isMonitored: true,
    state: 'active',
    createdAt: new Date('2026-03-31T13:00:00Z'),
    updatedAt: new Date('2026-03-31T13:00:00Z'),
    lastError: null,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<RepoStatusSnapshot> = {}
): RepoStatusSnapshot {
  return {
    id: 'snapshot-1',
    repoId: 'repo-1',
    observedAt: new Date('2026-03-31T13:30:00Z'),
    branch: 'main',
    isDetached: false,
    headSha: 'abcdef',
    upstreamRef: 'origin/main',
    upstreamHeadSha: 'abcdef',
    aheadCount: 0,
    behindCount: 0,
    liveAdditions: 120,
    liveDeletions: 8,
    liveFiles: 2,
    stagedAdditions: 12,
    stagedDeletions: 4,
    stagedFiles: 1,
    filesTouched: 2,
    repoSizeBytes: 1024,
    languageBreakdown: [
      { language: 'TypeScript', code: 100, comments: 5, blanks: 2 },
      { language: 'SQL', code: 25, comments: 0, blanks: 1 },
      { language: 'Markdown', code: 10, comments: 0, blanks: 0 },
    ],
    ...overrides,
  };
}

function createCommit(overrides: Partial<CommitEvent> = {}): CommitEvent {
  return {
    id: 'commit-1',
    repoId: 'repo-1',
    commitSha: 'deadbeef',
    authoredAt: new Date('2026-03-31T13:00:00Z'),
    authorName: 'Stephen Sawyer',
    authorEmail: 'stephen@example.com',
    summary: 'ship analytics rebuild',
    branch: 'main',
    additions: 40,
    deletions: 5,
    filesChanged: 2,
    isMerge: false,
    importedAt: new Date('2026-03-31T13:05:00Z'),
    ...overrides,
  };
}

function createPushEvent(overrides: Partial<PushEvent> = {}): PushEvent {
  return {
    id: 'push-1',
    repoId: 'repo-1',
    observedAt: new Date('2026-03-31T13:22:00Z'),
    kind: 'push_detected_local',
    headSha: 'deadbeef',
    pushedCommitCount: 1,
    upstreamRef: 'origin/main',
    notes: null,
    ...overrides,
  };
}

function createFileEvent(
  overrides: Partial<FileActivityEvent> = {}
): FileActivityEvent {
  return {
    id: 'file-1',
    repoId: 'repo-1',
    observedAt: new Date('2026-03-31T13:10:00Z'),
    relativePath: 'apps/api/src/app.ts',
    additions: 12,
    deletions: 3,
    kind: 'manual_rescan',
    ...overrides,
  };
}

describe('analytics rebuild', () => {
  test('sessionizes activity windows with a stable repo set', () => {
    const sessions = sessionizeActivity(
      [
        {
          repoId: 'repo-b',
          observedAt: new Date('2026-03-31T13:10:00Z'),
          changedLines: 5,
        },
        {
          repoId: 'repo-a',
          observedAt: new Date('2026-03-31T13:00:00Z'),
          changedLines: 7,
        },
        {
          repoId: 'repo-a',
          observedAt: new Date('2026-03-31T13:32:00Z'),
          changedLines: 2,
        },
      ],
      15,
      { idGenerator: () => 'session-id' }
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({
      id: 'session-id',
      startedAt: new Date('2026-03-31T13:00:00Z'),
      endedAt: new Date('2026-03-31T13:10:00Z'),
      activeMinutes: 10,
      repoIds: ['repo-a', 'repo-b'],
      eventCount: 2,
      totalChangedLines: 12,
    });
    expect(sessions[1]?.activeMinutes).toBe(1);
  });

  test('rebuilds sessions, rollups, achievements, and streaks from separate ledgers', async () => {
    let writtenSessions: readonly FocusSession[] = [];
    let writtenRollups: readonly DailyRollup[] = [];
    let writtenAchievements: readonly Achievement[] = [];

    const store = {
      listRepositories: async () => [createRepository()],
      allSnapshotsForAnalytics: async () => [createSnapshot()],
      allCommitsForAnalytics: async () => [createCommit()],
      allPushEventsForAnalytics: async () => [createPushEvent()],
      allFileActivityForAnalytics: async () => [createFileEvent()],
      replaceFocusSessions: async (sessions: readonly FocusSession[]) => {
        writtenSessions = sessions;
      },
      replaceDailyRollups: async (rollups: readonly DailyRollup[]) => {
        writtenRollups = rollups;
      },
      replaceAchievements: async (achievements: readonly Achievement[]) => {
        writtenAchievements = achievements;
      },
    };

    const report = await rebuildAnalytics(store, {
      sessionGapMinutes: 15,
      timezone: 'UTC',
      dayBoundaryMinutes: 0,
      now: new Date('2026-03-31T14:00:00Z'),
      idGenerator: () => 'session-1',
    });

    expect(report).toEqual({
      scannedRepositories: 1,
      scannedSnapshots: 1,
      scannedCommits: 1,
      scannedPushEvents: 1,
      scannedFileActivityEvents: 1,
      sessionsWritten: 1,
      rollupsWritten: 2,
      achievementsWritten: 5,
    });

    expect(writtenSessions).toHaveLength(1);
    expect(writtenSessions[0]).toEqual({
      id: 'session-1',
      startedAt: new Date('2026-03-31T13:00:00Z'),
      endedAt: new Date('2026-03-31T13:10:00Z'),
      activeMinutes: 10,
      repoIds: ['repo-1'],
      eventCount: 2,
      totalChangedLines: 60,
    });

    const allRollup = writtenRollups.find((rollup) => rollup.scope === 'all');
    const repoRollup = writtenRollups.find(
      (rollup) => rollup.scope === 'repo-1'
    );

    expect(allRollup).toEqual({
      scope: 'all',
      day: '2026-03-31',
      liveAdditions: 120,
      liveDeletions: 8,
      stagedAdditions: 12,
      stagedDeletions: 4,
      committedAdditions: 40,
      committedDeletions: 5,
      commits: 1,
      pushes: 1,
      focusMinutes: 10,
      filesTouched: 1,
      languagesTouched: 3,
      score: 156,
    });

    expect(repoRollup).toEqual({
      scope: 'repo-1',
      day: '2026-03-31',
      liveAdditions: 120,
      liveDeletions: 8,
      stagedAdditions: 12,
      stagedDeletions: 4,
      committedAdditions: 40,
      committedDeletions: 5,
      commits: 1,
      pushes: 1,
      focusMinutes: 0,
      filesTouched: 1,
      languagesTouched: 3,
      score: 136,
    });

    expect(writtenAchievements.map((achievement) => achievement.kind)).toEqual([
      'first_repo',
      'first_commit_tracked',
      'first_push_detected',
      'lines_100',
      'polyglot',
    ]);

    expect(
      computeStreaks(
        writtenRollups.filter((rollup) => rollup.scope === 'all'),
        new Date('2026-03-31T18:00:00Z')
      )
    ).toEqual({ currentDays: 1, bestDays: 1 });
  });
});
