import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  applySqlMigrations,
  closePostgresClient,
  createPostgresClient,
  createPostgresGitPulseStore,
  type PostgresClient,
  rebuildAnalytics,
} from '../src';

const databaseUrl = Bun.env.GITPULSE_TEST_DATABASE_URL;

if (!databaseUrl) {
  test('postgres analytics rebuild integration is skipped without GITPULSE_TEST_DATABASE_URL', () => {
    expect(databaseUrl).toBeUndefined();
  });
} else {
  const migrationsDir = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'db',
    'migrations'
  );

  let sql: PostgresClient;
  let store: ReturnType<typeof createPostgresGitPulseStore>;

  beforeAll(async () => {
    await applySqlMigrations({
      connectionString: databaseUrl,
      migrationsDir,
      retryCount: 5,
      retryDelayMs: 250,
    });

    sql = createPostgresClient(databaseUrl);
    store = createPostgresGitPulseStore(sql);
  });

  beforeEach(async () => {
    await sql.unsafe(`
      truncate table
        settings,
        achievements,
        daily_rollups,
        focus_sessions,
        push_events,
        commit_events,
        file_activity_events,
        repo_status_snapshots,
        repositories,
        tracked_targets
      restart identity cascade
    `);
  });

  afterAll(async () => {
    await closePostgresClient(sql);
  });

  test('rebuilds persisted analytics from PostgreSQL ledgers', async () => {
    const trackedTargetId = '11111111-1111-4111-8111-111111111111';
    const repoId = '22222222-2222-4222-8222-222222222222';

    await store.upsertTrackedTarget({
      id: trackedTargetId,
      path: '/tmp/gitpulse-fixtures',
      kind: 'folder',
      createdAt: new Date('2026-03-31T13:00:00Z'),
      lastScanAt: new Date('2026-03-31T13:10:00Z'),
    });

    await store.upsertRepository({
      id: repoId,
      targetId: trackedTargetId,
      name: 'gitpulse',
      rootPath: '/tmp/gitpulse-fixtures/gitpulse',
      remoteUrl: 'git@github.com-dunamismax:dunamismax/gitpulse.git',
      defaultBranch: 'main',
      includePatterns: ['apps/**', 'packages/**'],
      excludePatterns: ['node_modules/**'],
      isMonitored: true,
      state: 'active',
      createdAt: new Date('2026-03-31T13:00:00Z'),
      updatedAt: new Date('2026-03-31T13:05:00Z'),
      lastError: null,
    });

    await store.insertSnapshot({
      id: '33333333-3333-4333-8333-333333333333',
      repoId,
      observedAt: new Date('2026-03-31T13:30:00Z'),
      branch: 'main',
      isDetached: false,
      headSha: 'abcdef1234',
      upstreamRef: 'origin/main',
      upstreamHeadSha: 'abcdef1234',
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
    });

    await store.insertFileActivity([
      {
        id: '44444444-4444-4444-8444-444444444444',
        repoId,
        observedAt: new Date('2026-03-31T13:10:00Z'),
        relativePath: 'apps/api/src/app.ts',
        additions: 12,
        deletions: 3,
        kind: 'manual_rescan',
      },
    ]);

    await store.insertCommits([
      {
        id: '55555555-5555-4555-8555-555555555555',
        repoId,
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
      },
    ]);

    await store.insertPushEvent({
      id: '66666666-6666-4666-8666-666666666666',
      repoId,
      observedAt: new Date('2026-03-31T13:22:00Z'),
      kind: 'push_detected_local',
      headSha: 'deadbeef',
      pushedCommitCount: 1,
      upstreamRef: 'origin/main',
      notes: null,
    });

    const report = await rebuildAnalytics(store, {
      sessionGapMinutes: 15,
      timezone: 'UTC',
      dayBoundaryMinutes: 0,
      now: new Date('2026-03-31T14:00:00Z'),
      idGenerator: () => '77777777-7777-4777-8777-777777777777',
    });

    const sessions = await store.listFocusSessions(10);
    const allRollups = await store.listDailyRollups(null, 10);
    const repoRollups = await store.listDailyRollups(repoId, 10);
    const achievements = await store.listAchievements();

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

    expect(sessions).toEqual([
      {
        id: '77777777-7777-4777-8777-777777777777',
        startedAt: new Date('2026-03-31T13:00:00.000Z'),
        endedAt: new Date('2026-03-31T13:10:00.000Z'),
        activeMinutes: 10,
        repoIds: [repoId],
        eventCount: 2,
        totalChangedLines: 60,
      },
    ]);

    const allRollup = allRollups[0];
    const repoRollup = repoRollups[0];

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
      scope: repoId,
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

    expect(achievements.map((achievement) => achievement.kind)).toEqual([
      'first_repo',
      'first_commit_tracked',
      'first_push_detected',
      'lines_100',
      'polyglot',
    ]);
  });
}
