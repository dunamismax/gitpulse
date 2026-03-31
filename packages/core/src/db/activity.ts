import {
  type ActivityFeedItem,
  activityKinds,
  type CommitEvent,
  type FileActivityEvent,
  type PushEvent,
  pushKinds,
} from '../domain';
import {
  assertLimit,
  normalizeBoolean,
  normalizeEnumLike,
  normalizeNullableTimestamp,
  normalizeNumber,
  normalizeTimestamp,
  normalizeUuid,
  type PostgresClient,
} from './support';

interface FileActivityRow {
  id: string;
  repo_id: string;
  observed_at_utc: Date | string;
  relative_path: string;
  additions: number;
  deletions: number;
  kind: string;
}

interface CommitRow {
  id: string;
  repo_id: string;
  commit_sha: string;
  authored_at_utc: Date | string;
  author_name: string | null;
  author_email: string | null;
  summary: string;
  branch: string | null;
  additions: number;
  deletions: number;
  files_changed: number;
  is_merge: boolean | number | string;
  imported_at_utc: Date | string;
}

interface PushRow {
  id: string;
  repo_id: string;
  observed_at_utc: Date | string;
  kind: string;
  head_sha: string | null;
  pushed_commit_count: number;
  upstream_ref: string | null;
  notes: string | null;
}

interface FeedRow {
  kind: 'commit' | 'push' | 'file_change';
  repo_name: string;
  observed_at: Date | string;
  detail: string;
}

function mapFileActivity(row: FileActivityRow): FileActivityEvent {
  return {
    id: normalizeUuid(row.id, 'file_activity_events.id'),
    repoId: normalizeUuid(row.repo_id, 'file_activity_events.repo_id'),
    observedAt: normalizeTimestamp(
      row.observed_at_utc,
      'file_activity_events.observed_at_utc'
    ),
    relativePath: row.relative_path,
    additions: normalizeNumber(row.additions, 'file_activity_events.additions'),
    deletions: normalizeNumber(row.deletions, 'file_activity_events.deletions'),
    kind: normalizeEnumLike(
      row.kind,
      activityKinds,
      'file_activity_events.kind'
    ),
  };
}

function mapCommit(row: CommitRow): CommitEvent {
  return {
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
  };
}

function mapPush(row: PushRow): PushEvent {
  return {
    id: normalizeUuid(row.id, 'push_events.id'),
    repoId: normalizeUuid(row.repo_id, 'push_events.repo_id'),
    observedAt: normalizeTimestamp(
      row.observed_at_utc,
      'push_events.observed_at_utc'
    ),
    kind: normalizeEnumLike(row.kind, pushKinds, 'push_events.kind'),
    headSha: row.head_sha,
    pushedCommitCount: normalizeNumber(
      row.pushed_commit_count,
      'push_events.pushed_commit_count'
    ),
    upstreamRef: row.upstream_ref,
    notes: row.notes,
  };
}

function mapFeedItem(row: FeedRow): ActivityFeedItem {
  return {
    kind: row.kind,
    repoName: row.repo_name,
    timestamp: normalizeTimestamp(row.observed_at, 'feed.observed_at'),
    detail: row.detail,
  };
}

export async function insertFileActivity(
  sql: PostgresClient,
  events: readonly FileActivityEvent[]
) {
  if (events.length === 0) {
    return;
  }

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as PostgresClient;
    for (const event of events) {
      await tx`
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
          ${normalizeUuid(event.id, 'fileActivity.id')},
          ${normalizeUuid(event.repoId, 'fileActivity.repoId')},
          ${normalizeTimestamp(event.observedAt, 'fileActivity.observedAt')},
          ${event.relativePath},
          ${event.additions},
          ${event.deletions},
          ${normalizeEnumLike(event.kind, activityKinds, 'fileActivity.kind')}
        )
      `;
    }
  });
}

export async function topFilesTouched(
  sql: PostgresClient,
  repoId: string | null,
  limit: number
) {
  const rows = repoId
    ? await sql<{ relative_path: string }[]>`
        select relative_path
        from file_activity_events
        where repo_id = ${normalizeUuid(repoId, 'repoId')}
        group by relative_path
        order by count(*) desc, relative_path asc
        limit ${assertLimit(limit)}
      `
    : await sql<{ relative_path: string }[]>`
        select relative_path
        from file_activity_events
        group by relative_path
        order by count(*) desc, relative_path asc
        limit ${assertLimit(limit)}
      `;

  return rows.map((row) => row.relative_path);
}

export async function allFileActivityForAnalytics(sql: PostgresClient) {
  const rows = await sql<FileActivityRow[]>`
    select id, repo_id, observed_at_utc, relative_path, additions, deletions, kind
    from file_activity_events
    order by repo_id asc, observed_at_utc asc
  `;

  return rows.map(mapFileActivity);
}

export async function insertCommits(
  sql: PostgresClient,
  commits: readonly CommitEvent[]
) {
  if (commits.length === 0) {
    return 0;
  }

  let inserted = 0;

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as PostgresClient;
    for (const commit of commits) {
      const rows = await tx`
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
          ${normalizeUuid(commit.id, 'commit.id')},
          ${normalizeUuid(commit.repoId, 'commit.repoId')},
          ${commit.commitSha},
          ${normalizeTimestamp(commit.authoredAt, 'commit.authoredAt')},
          ${commit.authorName},
          ${commit.authorEmail},
          ${commit.summary},
          ${commit.branch},
          ${commit.additions},
          ${commit.deletions},
          ${commit.filesChanged},
          ${commit.isMerge},
          ${normalizeTimestamp(commit.importedAt, 'commit.importedAt')}
        )
        on conflict (repo_id, commit_sha) do nothing
        returning 1 as inserted
      `;

      inserted += rows.length;
    }
  });

  return inserted;
}

export async function listCommits(
  sql: PostgresClient,
  repoId: string | null,
  limit: number
) {
  const rows = repoId
    ? await sql<CommitRow[]>`
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
        where repo_id = ${normalizeUuid(repoId, 'repoId')}
        order by authored_at_utc desc
        limit ${assertLimit(limit)}
      `
    : await sql<CommitRow[]>`
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
        order by authored_at_utc desc
        limit ${assertLimit(limit)}
      `;

  return rows.map(mapCommit);
}

export async function allCommitsForAnalytics(sql: PostgresClient) {
  const rows = await sql<CommitRow[]>`
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
    order by repo_id asc, authored_at_utc asc
  `;

  return rows.map(mapCommit);
}

export async function insertPushEvent(sql: PostgresClient, push: PushEvent) {
  await sql`
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
      ${normalizeUuid(push.id, 'push.id')},
      ${normalizeUuid(push.repoId, 'push.repoId')},
      ${normalizeTimestamp(push.observedAt, 'push.observedAt')},
      ${normalizeEnumLike(push.kind, pushKinds, 'push.kind')},
      ${push.headSha},
      ${push.pushedCommitCount},
      ${push.upstreamRef},
      ${push.notes}
    )
  `;
}

export async function listPushEvents(
  sql: PostgresClient,
  repoId: string | null,
  limit: number
) {
  const rows = repoId
    ? await sql<PushRow[]>`
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
        where repo_id = ${normalizeUuid(repoId, 'repoId')}
        order by observed_at_utc desc
        limit ${assertLimit(limit)}
      `
    : await sql<PushRow[]>`
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
        order by observed_at_utc desc
        limit ${assertLimit(limit)}
      `;

  return rows.map(mapPush);
}

export async function allPushEventsForAnalytics(sql: PostgresClient) {
  const rows = await sql<PushRow[]>`
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
    order by repo_id asc, observed_at_utc asc
  `;

  return rows.map(mapPush);
}

export async function recentActivityFeed(sql: PostgresClient, limit: number) {
  const rows = await sql<FeedRow[]>`
    select kind, repo_name, observed_at, detail
    from (
      select
        'commit'::text as kind,
        repositories.name as repo_name,
        commit_events.authored_at_utc as observed_at,
        commit_events.summary as detail
      from commit_events
      join repositories on repositories.id = commit_events.repo_id
      where repositories.state != 'removed'

      union all

      select
        'push'::text as kind,
        repositories.name as repo_name,
        push_events.observed_at_utc as observed_at,
        coalesce(push_events.notes, 'push detected') as detail
      from push_events
      join repositories on repositories.id = push_events.repo_id
      where repositories.state != 'removed'

      union all

      select
        'file_change'::text as kind,
        repositories.name as repo_name,
        file_activity_events.observed_at_utc as observed_at,
        file_activity_events.relative_path as detail
      from file_activity_events
      join repositories on repositories.id = file_activity_events.repo_id
      where repositories.state != 'removed'
    ) feed
    order by observed_at desc
    limit ${assertLimit(limit)}
  `;

  return rows.map(mapFeedItem);
}

export function normalizeFeedTimestamp(
  value: Date | string | null | undefined
) {
  return normalizeNullableTimestamp(value, 'feed.timestamp');
}
