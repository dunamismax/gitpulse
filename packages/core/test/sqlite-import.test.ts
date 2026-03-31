import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  Achievement,
  CommitEvent,
  DailyRollup,
  FileActivityEvent,
  FocusSession,
  PushEvent,
  RepoStatusSnapshot,
  Repository,
  TrackedTarget,
} from '../src/domain';
import {
  type ImportedSettingRecord,
  importSqliteDatabase,
} from '../src/sqlite-import';

class InMemoryImportStore {
  trackedTargets: TrackedTarget[] = [];
  repositories: Repository[] = [];
  snapshots: RepoStatusSnapshot[] = [];
  fileActivity: FileActivityEvent[] = [];
  commits: CommitEvent[] = [];
  pushes: PushEvent[] = [];
  settings = new Map<string, { valueJson: unknown; updatedAt: Date }>();
  focusSessions: FocusSession[] = [];
  dailyRollups: DailyRollup[] = [];
  achievements: Achievement[] = [];

  async upsertTrackedTarget(target: TrackedTarget) {
    this.trackedTargets.push(target);
  }

  async upsertRepository(repository: Repository) {
    this.repositories.push(repository);
  }

  async insertSnapshot(snapshot: RepoStatusSnapshot) {
    this.snapshots.push(snapshot);
  }

  async insertFileActivity(events: readonly FileActivityEvent[]) {
    this.fileActivity.push(...events);
  }

  async insertCommits(commits: readonly CommitEvent[]) {
    let inserted = 0;

    for (const commit of commits) {
      const exists = this.commits.some(
        (existing) =>
          existing.repoId === commit.repoId &&
          existing.commitSha === commit.commitSha
      );
      if (exists) {
        continue;
      }

      this.commits.push(commit);
      inserted += 1;
    }

    return inserted;
  }

  async insertPushEvent(push: PushEvent) {
    this.pushes.push(push);
  }

  async upsertSetting(key: string, valueJson: unknown, updatedAt = new Date()) {
    this.settings.set(key, { valueJson, updatedAt });
  }

  async listRepositories() {
    return [...this.repositories];
  }

  async allSnapshotsForAnalytics() {
    return [...this.snapshots];
  }

  async allCommitsForAnalytics() {
    return [...this.commits];
  }

  async allPushEventsForAnalytics() {
    return [...this.pushes];
  }

  async allFileActivityForAnalytics() {
    return [...this.fileActivity];
  }

  async replaceFocusSessions(sessions: readonly FocusSession[]) {
    this.focusSessions = [...sessions];
  }

  async replaceDailyRollups(rollups: readonly DailyRollup[]) {
    this.dailyRollups = [...rollups];
  }

  async replaceAchievements(achievements: readonly Achievement[]) {
    this.achievements = [...achievements];
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

async function createLegacySqliteFixture() {
  const tempDir = await mkdtemp(join(tmpdir(), 'gitpulse-sqlite-import-'));
  tempDirs.push(tempDir);

  const sqlitePath = join(tempDir, 'gitpulse.db');
  const schemaPath = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'internal',
    'db',
    'schema.sql'
  );
  const schemaSql = await readFile(schemaPath, 'utf8');

  const db = new Database(sqlitePath);
  db.exec(schemaSql);

  db.exec(`
    insert into tracked_targets (id, path, kind, created_at_utc, last_scan_at_utc)
    values (
      '11111111-1111-4111-8111-111111111111',
      '/tmp/gitpulse-fixtures',
      'folder',
      '2026-01-13T09:00:00Z',
      '2026-01-13T09:05:00Z'
    );

    insert into repositories (
      id,
      target_id,
      name,
      root_path,
      remote_url,
      default_branch,
      include_patterns,
      exclude_patterns,
      is_monitored,
      state,
      created_at_utc,
      updated_at_utc,
      last_error
    )
    values (
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      'alpha',
      '/tmp/gitpulse-fixtures/alpha',
      'git@example.com:alpha.git',
      'main',
      '["src/**"]',
      '["dist/**"]',
      1,
      'active',
      '2026-01-13T09:00:00Z',
      '2026-01-13T09:06:00Z',
      null
    );

    insert into repo_status_snapshots (
      id,
      repo_id,
      observed_at_utc,
      branch,
      is_detached,
      head_sha,
      upstream_ref,
      upstream_head_sha,
      ahead_count,
      behind_count,
      live_additions,
      live_deletions,
      live_files,
      staged_additions,
      staged_deletions,
      staged_files,
      files_touched,
      repo_size_bytes,
      language_breakdown
    )
    values (
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '2026-01-13T10:00:00Z',
      'main',
      0,
      'deadbeef',
      'origin/main',
      'deadbeef',
      1,
      0,
      12,
      3,
      2,
      4,
      1,
      1,
      2,
      2048,
      '[{"language":"TypeScript","code":120,"comments":10,"blanks":5}]'
    );

    insert into file_activity_events (
      id,
      repo_id,
      observed_at_utc,
      relative_path,
      additions,
      deletions,
      kind
    )
    values (
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      '2026-01-13T10:05:00Z',
      'src/app.ts',
      12,
      3,
      'refresh'
    );

    insert into commit_events (
      id,
      repo_id,
      commit_sha,
      authored_at_utc,
      author_name,
      author_email,
      summary,
      branch,
      additions,
      deletions,
      files_changed,
      is_merge,
      imported_at_utc
    )
    values (
      '55555555-5555-4555-8555-555555555555',
      '22222222-2222-4222-8222-222222222222',
      'cafebabe',
      '2026-01-13T10:10:00Z',
      'Stephen Sawyer',
      'stephen@example.com',
      'Ship alpha fixture',
      'main',
      40,
      10,
      3,
      0,
      '2026-01-13T10:15:00Z'
    );

    insert into push_events (
      id,
      repo_id,
      observed_at_utc,
      kind,
      head_sha,
      pushed_commit_count,
      upstream_ref,
      notes
    )
    values (
      '66666666-6666-4666-8666-666666666666',
      '22222222-2222-4222-8222-222222222222',
      '2026-01-13T10:20:00Z',
      'push_detected_local',
      'cafebabe',
      1,
      'origin/main',
      'ahead by one commit'
    );

    insert into focus_sessions (
      id,
      started_at_utc,
      ended_at_utc,
      active_minutes,
      repo_ids,
      event_count,
      total_changed_lines
    )
    values (
      '77777777-7777-4777-8777-777777777777',
      '2025-01-01T00:00:00Z',
      '2025-01-01T00:10:00Z',
      10,
      '["22222222-2222-4222-8222-222222222222"]',
      1,
      5
    );

    insert into daily_rollups (
      scope,
      day,
      live_additions,
      live_deletions,
      staged_additions,
      staged_deletions,
      committed_additions,
      committed_deletions,
      commits,
      pushes,
      focus_minutes,
      files_touched,
      languages_touched,
      score
    )
    values (
      'all',
      '2025-01-01',
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      10,
      1,
      1,
      1
    );

    insert into achievements (kind, unlocked_at_utc, day, reason)
    values (
      'legacy_placeholder',
      '2025-01-01T00:00:00Z',
      '2025-01-01',
      'should be rebuilt, not copied'
    );

    insert into settings (key, value_json, updated_at_utc)
    values
      (
        'ui',
        '{"timezone":"America/Chicago","day_boundary_minutes":120}',
        '2026-01-13T08:00:00Z'
      ),
      (
        'legacy_note',
        '{"migrated":false}',
        '2026-01-13T08:05:00Z'
      );
  `);

  db.close();
  return sqlitePath;
}

test('imports canonical SQLite data, replays settings, and rebuilds derived tables', async () => {
  const sqlitePath = await createLegacySqliteFixture();
  const store = new InMemoryImportStore();

  const settingsRecords: ImportedSettingRecord[] = [
    { key: 'authors', valueJson: [{ email: 'stephen@example.com' }] },
    {
      key: 'goals',
      valueJson: {
        changed_lines_per_day: 250,
        commits_per_day: 3,
        focus_minutes_per_day: 90,
      },
    },
    {
      key: 'patterns',
      valueJson: {
        include: ['src/**'],
        exclude: ['dist/**'],
      },
    },
    {
      key: 'github',
      valueJson: {
        enabled: false,
        token: null,
        verify_remote_pushes: false,
      },
    },
    {
      key: 'monitoring',
      valueJson: {
        import_days: 3650,
        session_gap_minutes: 15,
        repo_discovery_depth: 5,
      },
    },
    {
      key: 'ui',
      valueJson: {
        timezone: 'UTC',
        day_boundary_minutes: 0,
      },
    },
  ];

  const report = await importSqliteDatabase({
    sqlitePath,
    store,
    settingsRecords,
    rebuildOptions: {
      timezone: 'UTC',
      dayBoundaryMinutes: 0,
      sessionGapMinutes: 15,
      now: new Date('2026-01-13T12:00:00Z'),
      idGenerator: () => '99999999-9999-4999-8999-999999999999',
    },
  });

  expect(report).toMatchObject({
    trackedTargetsImported: 1,
    repositoriesImported: 1,
    snapshotsImported: 1,
    fileActivityImported: 1,
    commitsImported: 1,
    pushesImported: 1,
    legacySettingsImported: 2,
    configSettingsImported: 6,
  });

  expect(store.trackedTargets[0]?.path).toBe('/tmp/gitpulse-fixtures');
  expect(store.repositories[0]?.includePatterns).toEqual(['src/**']);
  expect(store.snapshots[0]?.languageBreakdown[0]?.language).toBe('TypeScript');
  expect(store.fileActivity[0]?.kind).toBe('refresh');
  expect(store.commits[0]?.commitSha).toBe('cafebabe');
  expect(store.pushes[0]?.kind).toBe('push_detected_local');

  expect(store.settings.get('ui')?.valueJson).toEqual({
    timezone: 'UTC',
    day_boundary_minutes: 0,
  });
  expect(store.settings.get('legacy_note')?.valueJson).toEqual({
    migrated: false,
  });

  expect(store.focusSessions).not.toHaveLength(0);
  expect(store.focusSessions[0]?.id).toBe(
    '99999999-9999-4999-8999-999999999999'
  );
  expect(store.dailyRollups.some((rollup) => rollup.scope === 'all')).toBe(
    true
  );
  expect(store.achievements.map((achievement) => achievement.kind)).toEqual(
    expect.arrayContaining([
      'first_repo',
      'first_commit_tracked',
      'first_push_detected',
    ])
  );
  expect(
    store.achievements.map((achievement) => achievement.kind)
  ).not.toContain('legacy_placeholder');
  expect(report.rebuild.rollupsWritten).toBeGreaterThan(0);
  expect(report.rebuild.achievementsWritten).toBeGreaterThan(0);
});
