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

  test('all read routes assemble PostgreSQL-backed payloads', async () => {
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

    await store.upsertSetting('authors', [
      {
        email: 'stephen@example.com',
        name: 'Stephen Sawyer',
      },
    ]);
    await store.upsertSetting('goals', {
      changed_lines_per_day: 300,
      commits_per_day: 4,
      focus_minutes_per_day: 120,
    });
    await store.upsertSetting('patterns', {
      include: ['apps/**', 'packages/**'],
      exclude: ['node_modules/**'],
    });
    await store.upsertSetting('github', {
      enabled: true,
      token: 'github-secret',
      verify_remote_pushes: false,
    });
    await store.upsertSetting('monitoring', {
      import_days: 60,
      session_gap_minutes: 20,
      repo_discovery_depth: 7,
    });
    await store.upsertSetting('ui', {
      timezone: 'America/New_York',
      day_boundary_minutes: 90,
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
        GITPULSE_CONFIG_DIR: '/var/lib/gitpulse/config',
        GITPULSE_DATA_DIR: '/var/lib/gitpulse/data',
      },
      {
        readModels: createApiReadModels(
          store,
          {
            GITPULSE_API_HOST: '127.0.0.1',
            GITPULSE_API_PORT: 3001,
            GITPULSE_DATABASE_URL: databaseUrl,
            GITPULSE_CONFIG_DIR: '/var/lib/gitpulse/config',
            GITPULSE_DATA_DIR: '/var/lib/gitpulse/data',
          },
          {
            now: () => new Date('2026-03-31T14:00:00Z'),
          }
        ),
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
    expect(dashboardPayload.data.summary.goals).toMatchObject([
      { label: 'Changed Lines', target: 300 },
      { label: 'Commits', target: 4 },
      { label: 'Focus Minutes', target: 120 },
    ]);
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

    const detailResponse = await app.handle(
      new Request(`http://gitpulse.local/api/repositories/${repoId}`)
    );
    const detailPayload = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detailPayload.data.card.repo.id).toBe(repoId);
    expect(detailPayload.data.include_patterns).toEqual([
      'apps/**',
      'packages/**',
    ]);
    expect(detailPayload.data.recent_commits).toHaveLength(1);
    expect(detailPayload.data.recent_pushes).toHaveLength(1);
    expect(detailPayload.data.recent_sessions).toHaveLength(1);
    expect(detailPayload.data.language_breakdown).toHaveLength(2);
    expect(detailPayload.data.top_files).toEqual(['apps/api/src/app.ts']);

    const missingDetailResponse = await app.handle(
      new Request(
        'http://gitpulse.local/api/repositories/99999999-9999-4999-8999-999999999999'
      )
    );
    const missingDetailPayload = await missingDetailResponse.json();

    expect(missingDetailResponse.status).toBe(404);
    expect(missingDetailPayload.error).toBe('repository not found');

    const sessionsResponse = await app.handle(
      new Request('http://gitpulse.local/api/sessions')
    );
    const sessionsPayload = await sessionsResponse.json();

    expect(sessionsResponse.status).toBe(200);
    expect(sessionsPayload.data).toMatchObject({
      total_minutes: 10,
      average_length_minutes: 10,
      longest_session_minutes: 10,
    });
    expect(sessionsPayload.data.sessions).toHaveLength(1);

    const achievementsResponse = await app.handle(
      new Request('http://gitpulse.local/api/achievements')
    );
    const achievementsPayload = await achievementsResponse.json();

    expect(achievementsResponse.status).toBe(200);
    expect(achievementsPayload.data.streaks).toEqual({
      current_days: 1,
      best_days: 1,
    });
    expect(achievementsPayload.data.today_score).toBe(156);
    expect(achievementsPayload.data.achievements.length).toBeGreaterThan(0);

    const settingsResponse = await app.handle(
      new Request('http://gitpulse.local/api/settings')
    );
    const settingsPayload = await settingsResponse.json();

    expect(settingsResponse.status).toBe(200);
    expect(settingsPayload.data.config).toMatchObject({
      authors: [
        {
          email: 'stephen@example.com',
          name: 'Stephen Sawyer',
        },
      ],
      goals: {
        changed_lines_per_day: 300,
        commits_per_day: 4,
        focus_minutes_per_day: 120,
      },
      patterns: {
        include: ['apps/**', 'packages/**'],
        exclude: ['node_modules/**'],
      },
      github: {
        enabled: true,
        token: 'github-secret',
        verify_remote_pushes: false,
      },
      monitoring: {
        import_days: 60,
        session_gap_minutes: 20,
        repo_discovery_depth: 7,
      },
      ui: {
        timezone: 'America/New_York',
        day_boundary_minutes: 90,
      },
    });
    expect(settingsPayload.data.paths).toEqual({
      config_dir: '/var/lib/gitpulse/config',
      data_dir: '/var/lib/gitpulse/data',
      config_file: '/var/lib/gitpulse/config/gitpulse.toml',
    });
  });
}
