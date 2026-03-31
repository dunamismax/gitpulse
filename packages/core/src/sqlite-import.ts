import { Database } from 'bun:sqlite';

import { type RebuildAnalyticsOptions, rebuildAnalytics } from './analytics';
import type { PostgresGitPulseStore } from './db/store';
import {
  normalizeBoolean,
  normalizeEnumLike,
  normalizeJsonArray,
  normalizeNullableTimestamp,
  normalizeNumber,
  normalizeTimestamp,
  normalizeUuid,
} from './db/support';
import {
  type ActivityKind,
  activityKinds,
  type PushKind,
  pushKinds,
  repositoryStates,
  trackedTargetKinds,
} from './domain';

const requiredSqliteTables = [
  'tracked_targets',
  'repositories',
  'repo_status_snapshots',
  'file_activity_events',
  'commit_events',
  'push_events',
] as const;

interface LegacyTrackedTargetRow {
  id: string;
  path: string;
  kind: string;
  created_at_utc: string;
  last_scan_at_utc: string | null;
}

interface LegacyRepositoryRow {
  id: string;
  target_id: string | null;
  name: string;
  root_path: string;
  remote_url: string | null;
  default_branch: string | null;
  include_patterns: string | null;
  exclude_patterns: string | null;
  is_monitored: number | string;
  state: string;
  created_at_utc: string;
  updated_at_utc: string;
  last_error: string | null;
}

interface LegacySnapshotRow {
  id: string;
  repo_id: string;
  observed_at_utc: string;
  branch: string | null;
  is_detached: number | string;
  head_sha: string | null;
  upstream_ref: string | null;
  upstream_head_sha: string | null;
  ahead_count: number | string;
  behind_count: number | string;
  live_additions: number | string;
  live_deletions: number | string;
  live_files: number | string;
  staged_additions: number | string;
  staged_deletions: number | string;
  staged_files: number | string;
  files_touched: number | string;
  repo_size_bytes: number | string;
  language_breakdown: string | null;
}

interface LegacyFileActivityRow {
  id: string;
  repo_id: string;
  observed_at_utc: string;
  relative_path: string;
  additions: number | string;
  deletions: number | string;
  kind: string;
}

interface LegacyCommitRow {
  id: string;
  repo_id: string;
  commit_sha: string;
  authored_at_utc: string;
  author_name: string | null;
  author_email: string | null;
  summary: string;
  branch: string | null;
  additions: number | string;
  deletions: number | string;
  files_changed: number | string;
  is_merge: number | string;
  imported_at_utc: string;
}

interface LegacyPushRow {
  id: string;
  repo_id: string;
  observed_at_utc: string;
  kind: string;
  head_sha: string | null;
  pushed_commit_count: number | string;
  upstream_ref: string | null;
  notes: string | null;
}

interface LegacySettingRow {
  key: string;
  value_json: string;
  updated_at_utc: string;
}

export interface ImportedSettingRecord {
  key: string;
  valueJson: unknown;
  updatedAt?: Date | string;
}

export interface SQLiteImportReport {
  trackedTargetsImported: number;
  repositoriesImported: number;
  snapshotsImported: number;
  fileActivityImported: number;
  commitsImported: number;
  pushesImported: number;
  legacySettingsImported: number;
  configSettingsImported: number;
  rebuild: Awaited<ReturnType<typeof rebuildAnalytics>>;
}

export interface ImportSqliteDatabaseOptions {
  sqlitePath: string;
  store: SQLiteImportStore;
  settingsRecords?: readonly ImportedSettingRecord[];
  batchSize?: number;
  rebuildOptions?: RebuildAnalyticsOptions;
}

type SQLiteImportStore = Pick<
  PostgresGitPulseStore,
  | 'upsertTrackedTarget'
  | 'upsertRepository'
  | 'insertSnapshot'
  | 'insertFileActivity'
  | 'insertCommits'
  | 'insertPushEvent'
  | 'upsertSetting'
  | 'listRepositories'
  | 'allSnapshotsForAnalytics'
  | 'allCommitsForAnalytics'
  | 'allPushEventsForAnalytics'
  | 'allFileActivityForAnalytics'
  | 'replaceFocusSessions'
  | 'replaceDailyRollups'
  | 'replaceAchievements'
>;

function chunk<T>(values: readonly T[], size: number): T[][] {
  const normalizedSize = Math.max(1, Math.floor(size));
  const groups: T[][] = [];

  for (let index = 0; index < values.length; index += normalizedSize) {
    groups.push(values.slice(index, index + normalizedSize));
  }

  return groups;
}

function ensureSqliteCompatibility(db: Database) {
  const existingTables = new Set(
    db
      .query<{ name: string }, []>(
        `
          select name
          from sqlite_master
          where type = 'table'
        `
      )
      .all()
      .map((row) => row.name)
  );

  for (const table of requiredSqliteTables) {
    if (!existingTables.has(table)) {
      throw new Error(
        `legacy SQLite database is missing required table ${table}`
      );
    }
  }
}

function parseJsonValue(raw: string, fieldName: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${fieldName} must contain valid JSON: ${detail}`);
  }
}

function normalizeActivityKind(value: string, fieldName: string): ActivityKind {
  return normalizeEnumLike(value, activityKinds, fieldName);
}

function normalizePushKind(value: string, fieldName: string): PushKind {
  return normalizeEnumLike(value, pushKinds, fieldName);
}

export async function importSqliteDatabase({
  sqlitePath,
  store,
  settingsRecords = [],
  batchSize = 500,
  rebuildOptions = {},
}: ImportSqliteDatabaseOptions): Promise<SQLiteImportReport> {
  const db = new Database(sqlitePath, { readonly: true, create: false });

  try {
    ensureSqliteCompatibility(db);

    const trackedTargets = db
      .query<LegacyTrackedTargetRow, []>(
        `
          select id, path, kind, created_at_utc, last_scan_at_utc
          from tracked_targets
          order by created_at_utc asc, path asc
        `
      )
      .all();

    for (const trackedTarget of trackedTargets) {
      await store.upsertTrackedTarget({
        id: normalizeUuid(trackedTarget.id, 'tracked_targets.id'),
        path: trackedTarget.path,
        kind: normalizeEnumLike(
          trackedTarget.kind,
          trackedTargetKinds,
          'tracked_targets.kind'
        ),
        createdAt: normalizeTimestamp(
          trackedTarget.created_at_utc,
          'tracked_targets.created_at_utc'
        ),
        lastScanAt: normalizeNullableTimestamp(
          trackedTarget.last_scan_at_utc,
          'tracked_targets.last_scan_at_utc'
        ),
      });
    }

    const repositories = db
      .query<LegacyRepositoryRow, []>(
        `
          select
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
          from repositories
          order by created_at_utc asc, root_path asc
        `
      )
      .all();

    for (const repository of repositories) {
      await store.upsertRepository({
        id: normalizeUuid(repository.id, 'repositories.id'),
        targetId: repository.target_id
          ? normalizeUuid(repository.target_id, 'repositories.target_id')
          : null,
        name: repository.name,
        rootPath: repository.root_path,
        remoteUrl: repository.remote_url,
        defaultBranch: repository.default_branch,
        includePatterns: normalizeJsonArray<string>(
          repository.include_patterns,
          'repositories.include_patterns'
        ),
        excludePatterns: normalizeJsonArray<string>(
          repository.exclude_patterns,
          'repositories.exclude_patterns'
        ),
        isMonitored: normalizeBoolean(
          repository.is_monitored,
          'repositories.is_monitored'
        ),
        state: normalizeEnumLike(
          repository.state,
          repositoryStates,
          'repositories.state'
        ),
        createdAt: normalizeTimestamp(
          repository.created_at_utc,
          'repositories.created_at_utc'
        ),
        updatedAt: normalizeTimestamp(
          repository.updated_at_utc,
          'repositories.updated_at_utc'
        ),
        lastError: repository.last_error,
      });
    }

    const snapshots = db
      .query<LegacySnapshotRow, []>(
        `
          select
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
          from repo_status_snapshots
          order by observed_at_utc asc, id asc
        `
      )
      .all();

    for (const snapshot of snapshots) {
      await store.insertSnapshot({
        id: normalizeUuid(snapshot.id, 'repo_status_snapshots.id'),
        repoId: normalizeUuid(
          snapshot.repo_id,
          'repo_status_snapshots.repo_id'
        ),
        observedAt: normalizeTimestamp(
          snapshot.observed_at_utc,
          'repo_status_snapshots.observed_at_utc'
        ),
        branch: snapshot.branch,
        isDetached: normalizeBoolean(
          snapshot.is_detached,
          'repo_status_snapshots.is_detached'
        ),
        headSha: snapshot.head_sha,
        upstreamRef: snapshot.upstream_ref,
        upstreamHeadSha: snapshot.upstream_head_sha,
        aheadCount: normalizeNumber(
          snapshot.ahead_count,
          'repo_status_snapshots.ahead_count'
        ),
        behindCount: normalizeNumber(
          snapshot.behind_count,
          'repo_status_snapshots.behind_count'
        ),
        liveAdditions: normalizeNumber(
          snapshot.live_additions,
          'repo_status_snapshots.live_additions'
        ),
        liveDeletions: normalizeNumber(
          snapshot.live_deletions,
          'repo_status_snapshots.live_deletions'
        ),
        liveFiles: normalizeNumber(
          snapshot.live_files,
          'repo_status_snapshots.live_files'
        ),
        stagedAdditions: normalizeNumber(
          snapshot.staged_additions,
          'repo_status_snapshots.staged_additions'
        ),
        stagedDeletions: normalizeNumber(
          snapshot.staged_deletions,
          'repo_status_snapshots.staged_deletions'
        ),
        stagedFiles: normalizeNumber(
          snapshot.staged_files,
          'repo_status_snapshots.staged_files'
        ),
        filesTouched: normalizeNumber(
          snapshot.files_touched,
          'repo_status_snapshots.files_touched'
        ),
        repoSizeBytes: normalizeNumber(
          snapshot.repo_size_bytes,
          'repo_status_snapshots.repo_size_bytes'
        ),
        languageBreakdown: normalizeJsonArray(
          snapshot.language_breakdown,
          'repo_status_snapshots.language_breakdown'
        ),
      });
    }

    const fileActivityRows = db
      .query<LegacyFileActivityRow, []>(
        `
          select
            id,
            repo_id,
            observed_at_utc,
            relative_path,
            additions,
            deletions,
            kind
          from file_activity_events
          order by observed_at_utc asc, id asc
        `
      )
      .all();

    for (const batch of chunk(fileActivityRows, batchSize)) {
      await store.insertFileActivity(
        batch.map((row) => ({
          id: normalizeUuid(row.id, 'file_activity_events.id'),
          repoId: normalizeUuid(row.repo_id, 'file_activity_events.repo_id'),
          observedAt: normalizeTimestamp(
            row.observed_at_utc,
            'file_activity_events.observed_at_utc'
          ),
          relativePath: row.relative_path,
          additions: normalizeNumber(
            row.additions,
            'file_activity_events.additions'
          ),
          deletions: normalizeNumber(
            row.deletions,
            'file_activity_events.deletions'
          ),
          kind: normalizeActivityKind(row.kind, 'file_activity_events.kind'),
        }))
      );
    }

    const commitRows = db
      .query<LegacyCommitRow, []>(
        `
          select
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
          from commit_events
          order by authored_at_utc asc, id asc
        `
      )
      .all();

    let commitsImported = 0;
    for (const batch of chunk(commitRows, batchSize)) {
      commitsImported += await store.insertCommits(
        batch.map((row) => ({
          id: normalizeUuid(row.id, 'commit_events.id'),
          repoId: normalizeUuid(row.repo_id, 'commit_events.repo_id'),
          commitSha: row.commit_sha,
          authoredAt: normalizeTimestamp(
            row.authored_at_utc,
            'commit_events.authored_at_utc'
          ),
          authorName: row.author_name,
          authorEmail: row.author_email,
          summary: row.summary,
          branch: row.branch,
          additions: normalizeNumber(row.additions, 'commit_events.additions'),
          deletions: normalizeNumber(row.deletions, 'commit_events.deletions'),
          filesChanged: normalizeNumber(
            row.files_changed,
            'commit_events.files_changed'
          ),
          isMerge: normalizeBoolean(row.is_merge, 'commit_events.is_merge'),
          importedAt: normalizeTimestamp(
            row.imported_at_utc,
            'commit_events.imported_at_utc'
          ),
        }))
      );
    }

    const pushRows = db
      .query<LegacyPushRow, []>(
        `
          select
            id,
            repo_id,
            observed_at_utc,
            kind,
            head_sha,
            pushed_commit_count,
            upstream_ref,
            notes
          from push_events
          order by observed_at_utc asc, id asc
        `
      )
      .all();

    for (const push of pushRows) {
      await store.insertPushEvent({
        id: normalizeUuid(push.id, 'push_events.id'),
        repoId: normalizeUuid(push.repo_id, 'push_events.repo_id'),
        observedAt: normalizeTimestamp(
          push.observed_at_utc,
          'push_events.observed_at_utc'
        ),
        kind: normalizePushKind(push.kind, 'push_events.kind'),
        headSha: push.head_sha,
        pushedCommitCount: normalizeNumber(
          push.pushed_commit_count,
          'push_events.pushed_commit_count'
        ),
        upstreamRef: push.upstream_ref,
        notes: push.notes,
      });
    }

    let legacySettingsImported = 0;
    const settingsTableExists =
      db
        .query<{ present: number }, [string]>(
          `
            select count(*) as present
            from sqlite_master
            where type = 'table' and name = ?
          `
        )
        .get('settings')?.present === 1;

    if (settingsTableExists) {
      const legacySettings = db
        .query<LegacySettingRow, []>(
          `
            select key, value_json, updated_at_utc
            from settings
            order by key asc
          `
        )
        .all();

      for (const setting of legacySettings) {
        await store.upsertSetting(
          setting.key,
          parseJsonValue(
            setting.value_json,
            `settings.${setting.key}.value_json`
          ),
          normalizeTimestamp(
            setting.updated_at_utc,
            `settings.${setting.key}.updated_at_utc`
          )
        );
        legacySettingsImported += 1;
      }
    }

    for (const setting of settingsRecords) {
      await store.upsertSetting(
        setting.key,
        setting.valueJson,
        setting.updatedAt
          ? normalizeTimestamp(
              setting.updatedAt,
              `settings.${setting.key}.updatedAt`
            )
          : new Date()
      );
    }

    const rebuild = await rebuildAnalytics(store, rebuildOptions);

    return {
      trackedTargetsImported: trackedTargets.length,
      repositoriesImported: repositories.length,
      snapshotsImported: snapshots.length,
      fileActivityImported: fileActivityRows.length,
      commitsImported,
      pushesImported: pushRows.length,
      legacySettingsImported,
      configSettingsImported: settingsRecords.length,
      rebuild,
    };
  } finally {
    db.close();
  }
}
