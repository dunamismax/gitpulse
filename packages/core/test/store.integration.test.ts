import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  applySqlMigrations,
  closePostgresClient,
  createPostgresClient,
  createPostgresGitPulseStore,
  type PostgresClient,
} from '../src';

const databaseUrl = Bun.env.GITPULSE_TEST_DATABASE_URL;

if (!databaseUrl) {
  test('postgres store integration is skipped without GITPULSE_TEST_DATABASE_URL', () => {
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

  test('round-trips the Phase 2 PostgreSQL store on a real database', async () => {
    const trackedTargetId = '11111111-1111-4111-8111-111111111111';
    const repoId = '22222222-2222-4222-8222-222222222222';
    const snapshotId = '33333333-3333-4333-8333-333333333333';
    const fileEventId = '44444444-4444-4444-8444-444444444444';
    const commitId = '55555555-5555-4555-8555-555555555555';
    const pushId = '66666666-6666-4666-8666-666666666666';
    const sessionId = '77777777-7777-4777-8777-777777777777';

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
      includePatterns: ['cmd/**', 'internal/**'],
      excludePatterns: ['.git/**', 'dist/**'],
      isMonitored: true,
      state: 'active',
      createdAt: new Date('2026-03-31T13:00:00Z'),
      updatedAt: new Date('2026-03-31T13:05:00Z'),
      lastError: null,
    });

    await store.setRepositoryPatterns(repoId, ['apps/**'], ['node_modules/**']);
    await store.setRepositoryState(repoId, 'disabled', false);
    await store.setRepositoryState(repoId, 'active', true);

    await store.insertSnapshot({
      id: snapshotId,
      repoId,
      observedAt: new Date('2026-03-31T13:15:00Z'),
      branch: 'main',
      isDetached: false,
      headSha: 'abcdef1234',
      upstreamRef: 'origin/main',
      upstreamHeadSha: 'abcdef1234',
      aheadCount: 1,
      behindCount: 0,
      liveAdditions: 12,
      liveDeletions: 3,
      liveFiles: 2,
      stagedAdditions: 4,
      stagedDeletions: 1,
      stagedFiles: 1,
      filesTouched: 2,
      repoSizeBytes: 1024,
      languageBreakdown: [
        { language: 'TypeScript', code: 100, comments: 10, blanks: 5 },
      ],
    });

    await store.insertFileActivity([
      {
        id: fileEventId,
        repoId,
        observedAt: new Date('2026-03-31T13:16:00Z'),
        relativePath: 'apps/api/src/index.ts',
        additions: 12,
        deletions: 3,
        kind: 'manual_rescan',
      },
    ]);

    const insertedCommits = await store.insertCommits([
      {
        id: commitId,
        repoId,
        commitSha: 'deadbeef',
        authoredAt: new Date('2026-03-31T09:00:00-04:00'),
        authorName: 'Stephen Sawyer',
        authorEmail: 'stephen@example.com',
        summary: 'ship a real postgres store',
        branch: 'main',
        additions: 42,
        deletions: 7,
        filesChanged: 3,
        isMerge: false,
        importedAt: new Date('2026-03-31T13:20:00Z'),
      },
    ]);

    const duplicateInsertCount = await store.insertCommits([
      {
        id: '88888888-8888-4888-8888-888888888888',
        repoId,
        commitSha: 'deadbeef',
        authoredAt: new Date('2026-03-31T09:00:00-04:00'),
        authorName: 'Stephen Sawyer',
        authorEmail: 'stephen@example.com',
        summary: 'duplicate commit should be ignored',
        branch: 'main',
        additions: 42,
        deletions: 7,
        filesChanged: 3,
        isMerge: false,
        importedAt: new Date('2026-03-31T13:20:00Z'),
      },
    ]);

    await store.insertPushEvent({
      id: pushId,
      repoId,
      observedAt: new Date('2026-03-31T13:25:00Z'),
      kind: 'push_detected_local',
      headSha: 'deadbeef',
      pushedCommitCount: 1,
      upstreamRef: 'origin/main',
      notes: 'ahead by one commit',
    });

    await store.replaceFocusSessions([
      {
        id: sessionId,
        startedAt: new Date('2026-03-31T13:00:00Z'),
        endedAt: new Date('2026-03-31T13:30:00Z'),
        activeMinutes: 30,
        repoIds: [repoId],
        eventCount: 3,
        totalChangedLines: 64,
      },
    ]);

    await store.replaceDailyRollups([
      {
        scope: 'all',
        day: '2026-03-31',
        liveAdditions: 12,
        liveDeletions: 3,
        stagedAdditions: 4,
        stagedDeletions: 1,
        committedAdditions: 42,
        committedDeletions: 7,
        commits: 1,
        pushes: 1,
        focusMinutes: 30,
        filesTouched: 2,
        languagesTouched: 1,
        score: 88,
      },
    ]);

    await store.replaceAchievements([
      {
        kind: 'first_commit_tracked',
        unlockedAt: new Date('2026-03-31T13:30:00Z'),
        day: '2026-03-31',
        reason: 'Imported the first commit into PostgreSQL.',
      },
    ]);

    await store.upsertSetting('ui', {
      timezone: 'UTC',
      day_boundary_minutes: 0,
    });

    const trackedTargets = await store.listTrackedTargets();
    const repository = await store.getRepository(repoId);
    const foundRepository = await store.findRepository(
      '/tmp/gitpulse-fixtures/gitpulse'
    );
    const latestSnapshot = await store.latestSnapshot(repoId);
    const recentSnapshots = await store.recentSnapshots(repoId, 5);
    const fileActivity = await store.allFileActivityForAnalytics();
    const topFiles = await store.topFilesTouched(repoId, 5);
    const commits = await store.listCommits(repoId, 5);
    const allCommits = await store.allCommitsForAnalytics();
    const pushes = await store.listPushEvents(repoId, 5);
    const allPushes = await store.allPushEventsForAnalytics();
    const sessions = await store.listFocusSessions(5);
    const rollups = await store.listDailyRollups(null, 5);
    const allScopeRollups = await store.allRollupsForScope('all');
    const achievements = await store.listAchievements();
    const settings = await store.listSettings();
    const feed = await store.recentActivityFeed(10);

    expect(insertedCommits).toBe(1);
    expect(duplicateInsertCount).toBe(0);

    expect(trackedTargets).toHaveLength(1);
    expect(trackedTargets[0]?.kind).toBe('folder');
    expect(repository?.includePatterns).toEqual(['apps/**']);
    expect(repository?.excludePatterns).toEqual(['node_modules/**']);
    expect(repository?.isMonitored).toBe(true);
    expect(foundRepository?.id).toBe(repoId);

    expect(latestSnapshot?.languageBreakdown[0]?.language).toBe('TypeScript');
    expect(recentSnapshots).toHaveLength(1);

    expect(fileActivity).toHaveLength(1);
    expect(topFiles).toEqual(['apps/api/src/index.ts']);
    expect(commits).toHaveLength(1);
    expect(allCommits).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect(allPushes).toHaveLength(1);

    expect(sessions[0]?.repoIds).toEqual([repoId]);
    expect(rollups[0]?.day).toBe('2026-03-31');
    expect(allScopeRollups).toHaveLength(1);
    expect(achievements[0]?.kind).toBe('first_commit_tracked');
    expect(settings[0]?.valueJson).toEqual({
      timezone: 'UTC',
      day_boundary_minutes: 0,
    });

    expect(feed.map((item) => item.kind)).toEqual([
      'push',
      'file_change',
      'commit',
    ]);
  });

  afterAll(async () => {
    await closePostgresClient(sql);
  });
}
