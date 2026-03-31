import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  applySqlMigrations,
  closePostgresClient,
  createPostgresClient,
  createPostgresGitPulseStore,
  type PostgresClient,
  rebuildAnalytics,
} from '@gitpulse-vnext/core';

import { createApp } from '../src/app';
import { createApiReadModels } from '../src/read-models';

const databaseUrl = Bun.env.GITPULSE_TEST_DATABASE_URL;

if (!databaseUrl) {
  test('api postgres integration is skipped without GITPULSE_TEST_DATABASE_URL', () => {
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

  test('GET /api/dashboard and /api/repositories read from PostgreSQL', async () => {
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
        summary: 'ship dashboard and repositories routes',
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
      notes: 'ahead by one commit',
    });

    await rebuildAnalytics(store, {
      sessionGapMinutes: 15,
      timezone: 'UTC',
      dayBoundaryMinutes: 0,
      now: new Date('2026-03-31T14:00:00Z'),
      idGenerator: () => '77777777-7777-4777-8777-777777777777',
    });

    const app = createApp(
      {
        GITPULSE_API_HOST: '127.0.0.1',
        GITPULSE_API_PORT: 3001,
        GITPULSE_DATABASE_URL: databaseUrl,
      },
      {
        readModels: createApiReadModels(store, {
          now: () => new Date('2026-03-31T14:00:00Z'),
        }),
      }
    );

    const dashboardResponse = await app.handle(
      new Request('http://gitpulse.local/api/dashboard')
    );
    const dashboardPayload = await dashboardResponse.json();

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardPayload.data.summary).toMatchObject({
      live_lines: 128,
      staged_lines: 16,
      commits_today: 1,
      pushes_today: 1,
      active_session_minutes: 10,
      streak_days: 1,
      best_streak_days: 1,
      today_score: 156,
    });
    expect(dashboardPayload.data.summary.goals).toHaveLength(3);
    expect(
      dashboardPayload.data.activity_feed.map(
        (item: { kind: string }) => item.kind
      )
    ).toEqual(['push', 'file_change', 'commit']);
    expect(dashboardPayload.data.repo_cards).toHaveLength(1);
    expect(dashboardPayload.data.repo_cards[0]).toMatchObject({
      health: 'Healthy',
      sparkline: [60],
      repo: {
        id: repoId,
        name: 'gitpulse',
        state: 'active',
      },
      metrics: {
        day: '2026-03-31',
        score: 136,
      },
    });

    const repositoriesResponse = await app.handle(
      new Request('http://gitpulse.local/api/repositories')
    );
    const repositoriesPayload = await repositoriesResponse.json();

    expect(repositoriesResponse.status).toBe(200);
    expect(repositoriesPayload.data.repositories).toHaveLength(1);
    expect(repositoriesPayload.data.repositories[0]).toMatchObject({
      health: 'Healthy',
      repo: {
        id: repoId,
        root_path: '/tmp/gitpulse-fixtures/gitpulse',
      },
      snapshot: {
        branch: 'main',
        upstream_ref: 'origin/main',
      },
    });
  });
}
