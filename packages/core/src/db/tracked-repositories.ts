import {
  activityKinds,
  type RepoStatusSnapshot,
  type Repository,
  repositoryStates,
  type TrackedTarget,
  trackedTargetKinds,
} from '../domain';
import {
  assertLimit,
  jsonb,
  normalizeBoolean,
  normalizeEnumLike,
  normalizeJsonArray,
  normalizeNullableTimestamp,
  normalizeNumber,
  normalizeTimestamp,
  normalizeUuid,
  type PostgresClient,
} from './support';

interface TrackedTargetRow {
  id: string;
  path: string;
  kind: string;
  created_at_utc: Date | string;
  last_scan_at_utc: Date | string | null;
}

interface RepositoryRow {
  id: string;
  target_id: string | null;
  name: string;
  root_path: string;
  remote_url: string | null;
  default_branch: string | null;
  include_patterns: string[] | string | null;
  exclude_patterns: string[] | string | null;
  is_monitored: boolean | number | string;
  state: string;
  created_at_utc: Date | string;
  updated_at_utc: Date | string;
  last_error: string | null;
}

interface SnapshotRow {
  id: string;
  repo_id: string;
  observed_at_utc: Date | string;
  branch: string | null;
  is_detached: boolean | number | string;
  head_sha: string | null;
  upstream_ref: string | null;
  upstream_head_sha: string | null;
  ahead_count: number;
  behind_count: number;
  live_additions: number;
  live_deletions: number;
  live_files: number;
  staged_additions: number;
  staged_deletions: number;
  staged_files: number;
  files_touched: number;
  repo_size_bytes: number;
  language_breakdown: RepoStatusSnapshot['languageBreakdown'] | string | null;
}

function mapTrackedTarget(row: TrackedTargetRow): TrackedTarget {
  return {
    id: normalizeUuid(row.id, 'tracked_targets.id'),
    path: row.path,
    kind: normalizeEnumLike(
      row.kind,
      trackedTargetKinds,
      'tracked_targets.kind'
    ),
    createdAt: normalizeTimestamp(
      row.created_at_utc,
      'tracked_targets.created_at_utc'
    ),
    lastScanAt: normalizeNullableTimestamp(
      row.last_scan_at_utc,
      'tracked_targets.last_scan_at_utc'
    ),
  };
}

function mapRepository(row: RepositoryRow): Repository {
  return {
    id: normalizeUuid(row.id, 'repositories.id'),
    targetId: row.target_id
      ? normalizeUuid(row.target_id, 'repositories.target_id')
      : null,
    name: row.name,
    rootPath: row.root_path,
    remoteUrl: row.remote_url,
    defaultBranch: row.default_branch,
    includePatterns: normalizeJsonArray<string>(
      row.include_patterns,
      'repositories.include_patterns'
    ),
    excludePatterns: normalizeJsonArray<string>(
      row.exclude_patterns,
      'repositories.exclude_patterns'
    ),
    isMonitored: normalizeBoolean(
      row.is_monitored,
      'repositories.is_monitored'
    ),
    state: normalizeEnumLike(row.state, repositoryStates, 'repositories.state'),
    createdAt: normalizeTimestamp(
      row.created_at_utc,
      'repositories.created_at_utc'
    ),
    updatedAt: normalizeTimestamp(
      row.updated_at_utc,
      'repositories.updated_at_utc'
    ),
    lastError: row.last_error,
  };
}

function mapSnapshot(row: SnapshotRow): RepoStatusSnapshot {
  return {
    id: normalizeUuid(row.id, 'repo_status_snapshots.id'),
    repoId: normalizeUuid(row.repo_id, 'repo_status_snapshots.repo_id'),
    observedAt: normalizeTimestamp(
      row.observed_at_utc,
      'repo_status_snapshots.observed_at_utc'
    ),
    branch: row.branch,
    isDetached: normalizeBoolean(
      row.is_detached,
      'repo_status_snapshots.is_detached'
    ),
    headSha: row.head_sha,
    upstreamRef: row.upstream_ref,
    upstreamHeadSha: row.upstream_head_sha,
    aheadCount: normalizeNumber(
      row.ahead_count,
      'repo_status_snapshots.ahead_count'
    ),
    behindCount: normalizeNumber(
      row.behind_count,
      'repo_status_snapshots.behind_count'
    ),
    liveAdditions: normalizeNumber(
      row.live_additions,
      'repo_status_snapshots.live_additions'
    ),
    liveDeletions: normalizeNumber(
      row.live_deletions,
      'repo_status_snapshots.live_deletions'
    ),
    liveFiles: normalizeNumber(
      row.live_files,
      'repo_status_snapshots.live_files'
    ),
    stagedAdditions: normalizeNumber(
      row.staged_additions,
      'repo_status_snapshots.staged_additions'
    ),
    stagedDeletions: normalizeNumber(
      row.staged_deletions,
      'repo_status_snapshots.staged_deletions'
    ),
    stagedFiles: normalizeNumber(
      row.staged_files,
      'repo_status_snapshots.staged_files'
    ),
    filesTouched: normalizeNumber(
      row.files_touched,
      'repo_status_snapshots.files_touched'
    ),
    repoSizeBytes: normalizeNumber(
      row.repo_size_bytes,
      'repo_status_snapshots.repo_size_bytes'
    ),
    languageBreakdown: normalizeJsonArray(
      row.language_breakdown,
      'repo_status_snapshots.language_breakdown'
    ),
  };
}

export async function upsertTrackedTarget(
  sql: PostgresClient,
  target: TrackedTarget
) {
  await sql`
    insert into tracked_targets (
      id,
      path,
      kind,
      created_at_utc,
      last_scan_at_utc
    )
    values (
      ${normalizeUuid(target.id, 'trackedTarget.id')},
      ${target.path},
      ${normalizeEnumLike(target.kind, trackedTargetKinds, 'trackedTarget.kind')},
      ${normalizeTimestamp(target.createdAt, 'trackedTarget.createdAt')},
      ${normalizeNullableTimestamp(target.lastScanAt, 'trackedTarget.lastScanAt')}
    )
    on conflict (path) do update set
      last_scan_at_utc = excluded.last_scan_at_utc
  `;
}

export async function listTrackedTargets(sql: PostgresClient) {
  const rows = await sql<TrackedTargetRow[]>`
    select id, path, kind, created_at_utc, last_scan_at_utc
    from tracked_targets
    order by path asc
  `;

  return rows.map(mapTrackedTarget);
}

export async function upsertRepository(
  sql: PostgresClient,
  repository: Repository
) {
  await sql`
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
      ${normalizeUuid(repository.id, 'repository.id')},
      ${
        repository.targetId
          ? normalizeUuid(repository.targetId, 'repository.targetId')
          : null
      },
      ${repository.name},
      ${repository.rootPath},
      ${repository.remoteUrl},
      ${repository.defaultBranch},
      ${jsonb(sql, repository.includePatterns)},
      ${jsonb(sql, repository.excludePatterns)},
      ${repository.isMonitored},
      ${normalizeEnumLike(repository.state, repositoryStates, 'repository.state')},
      ${normalizeTimestamp(repository.createdAt, 'repository.createdAt')},
      ${normalizeTimestamp(repository.updatedAt, 'repository.updatedAt')},
      ${repository.lastError}
    )
    on conflict (root_path) do update set
      name = excluded.name,
      remote_url = excluded.remote_url,
      default_branch = excluded.default_branch,
      is_monitored = excluded.is_monitored,
      state = excluded.state,
      updated_at_utc = excluded.updated_at_utc,
      last_error = excluded.last_error
  `;
}

export async function listRepositories(sql: PostgresClient) {
  const rows = await sql<RepositoryRow[]>`
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
    order by name asc
  `;

  return rows.map(mapRepository);
}

export async function getRepository(sql: PostgresClient, id: string) {
  const rows = await sql<RepositoryRow[]>`
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
    where id = ${normalizeUuid(id, 'repositoryId')}
  `;

  return rows[0] ? mapRepository(rows[0]) : null;
}

export async function findRepository(sql: PostgresClient, selector: string) {
  const rows = await sql<RepositoryRow[]>`
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
    where name = ${selector}
       or root_path = ${selector}
       or root_path like ${`${selector}%`}
       or id::text = ${selector}
    order by name asc
    limit 1
  `;

  return rows[0] ? mapRepository(rows[0]) : null;
}

export async function setRepositoryState(
  sql: PostgresClient,
  id: string,
  state: Repository['state'],
  isMonitored: boolean
) {
  await sql`
    update repositories
    set
      state = ${normalizeEnumLike(state, repositoryStates, 'repository.state')},
      is_monitored = ${isMonitored},
      updated_at_utc = ${new Date()}
    where id = ${normalizeUuid(id, 'repositoryId')}
  `;
}

export async function setRepositoryPatterns(
  sql: PostgresClient,
  id: string,
  includePatterns: string[],
  excludePatterns: string[]
) {
  await sql`
    update repositories
    set
      include_patterns = ${jsonb(sql, includePatterns)},
      exclude_patterns = ${jsonb(sql, excludePatterns)},
      updated_at_utc = ${new Date()}
    where id = ${normalizeUuid(id, 'repositoryId')}
  `;
}

export async function insertSnapshot(
  sql: PostgresClient,
  snapshot: RepoStatusSnapshot
) {
  await sql`
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
      ${normalizeUuid(snapshot.id, 'snapshot.id')},
      ${normalizeUuid(snapshot.repoId, 'snapshot.repoId')},
      ${normalizeTimestamp(snapshot.observedAt, 'snapshot.observedAt')},
      ${snapshot.branch},
      ${snapshot.isDetached},
      ${snapshot.headSha},
      ${snapshot.upstreamRef},
      ${snapshot.upstreamHeadSha},
      ${snapshot.aheadCount},
      ${snapshot.behindCount},
      ${snapshot.liveAdditions},
      ${snapshot.liveDeletions},
      ${snapshot.liveFiles},
      ${snapshot.stagedAdditions},
      ${snapshot.stagedDeletions},
      ${snapshot.stagedFiles},
      ${snapshot.filesTouched},
      ${snapshot.repoSizeBytes},
      ${jsonb(sql, snapshot.languageBreakdown)}
    )
  `;
}

export async function latestSnapshot(sql: PostgresClient, repoId: string) {
  const rows = await sql<SnapshotRow[]>`
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
    where repo_id = ${normalizeUuid(repoId, 'repoId')}
    order by observed_at_utc desc
    limit 1
  `;

  return rows[0] ? mapSnapshot(rows[0]) : null;
}

export async function recentSnapshots(
  sql: PostgresClient,
  repoId: string,
  limit: number
) {
  const rows = await sql<SnapshotRow[]>`
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
    where repo_id = ${normalizeUuid(repoId, 'repoId')}
    order by observed_at_utc desc
    limit ${assertLimit(limit)}
  `;

  return rows.map(mapSnapshot);
}

export async function allSnapshotsForAnalytics(sql: PostgresClient) {
  const rows = await sql<SnapshotRow[]>`
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
    order by repo_id asc, observed_at_utc asc
  `;

  return rows.map(mapSnapshot);
}

export function isRecognizedActivityKind(value: string) {
  return activityKinds.includes(value as (typeof activityKinds)[number]);
}
