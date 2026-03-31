import type {
  Achievement,
  DailyRollup,
  FocusSession,
  SettingRecord,
} from '../domain';
import {
  assertLimit,
  jsonb,
  normalizeDate,
  normalizeJsonArray,
  normalizeNullableDate,
  normalizeNullableTimestamp,
  normalizeNumber,
  normalizeTimestamp,
  normalizeUuid,
  type PostgresClient,
} from './support';

interface FocusSessionRow {
  id: string;
  started_at_utc: Date | string;
  ended_at_utc: Date | string;
  active_minutes: number;
  repo_ids: string[] | string | null;
  event_count: number;
  total_changed_lines: number;
}

interface DailyRollupRow {
  scope: string;
  day: Date | string;
  live_additions: number;
  live_deletions: number;
  staged_additions: number;
  staged_deletions: number;
  committed_additions: number;
  committed_deletions: number;
  commits: number;
  pushes: number;
  focus_minutes: number;
  files_touched: number;
  languages_touched: number;
  score: number;
}

interface AchievementRow {
  kind: string;
  unlocked_at_utc: Date | string;
  day: Date | string | null;
  reason: string;
}

interface SettingRow {
  key: string;
  value_json: unknown;
  updated_at_utc: Date | string;
}

function mapFocusSession(row: FocusSessionRow): FocusSession {
  return {
    id: normalizeUuid(row.id, 'focus_sessions.id'),
    startedAt: normalizeTimestamp(
      row.started_at_utc,
      'focus_sessions.started_at_utc'
    ),
    endedAt: normalizeTimestamp(
      row.ended_at_utc,
      'focus_sessions.ended_at_utc'
    ),
    activeMinutes: normalizeNumber(
      row.active_minutes,
      'focus_sessions.active_minutes'
    ),
    repoIds: normalizeJsonArray<string>(
      row.repo_ids,
      'focus_sessions.repo_ids'
    ).map((value) => normalizeUuid(value, 'focus_sessions.repo_ids[]')),
    eventCount: normalizeNumber(row.event_count, 'focus_sessions.event_count'),
    totalChangedLines: normalizeNumber(
      row.total_changed_lines,
      'focus_sessions.total_changed_lines'
    ),
  };
}

function mapDailyRollup(row: DailyRollupRow): DailyRollup {
  return {
    scope: row.scope,
    day: normalizeDate(row.day, 'daily_rollups.day'),
    liveAdditions: normalizeNumber(
      row.live_additions,
      'daily_rollups.live_additions'
    ),
    liveDeletions: normalizeNumber(
      row.live_deletions,
      'daily_rollups.live_deletions'
    ),
    stagedAdditions: normalizeNumber(
      row.staged_additions,
      'daily_rollups.staged_additions'
    ),
    stagedDeletions: normalizeNumber(
      row.staged_deletions,
      'daily_rollups.staged_deletions'
    ),
    committedAdditions: normalizeNumber(
      row.committed_additions,
      'daily_rollups.committed_additions'
    ),
    committedDeletions: normalizeNumber(
      row.committed_deletions,
      'daily_rollups.committed_deletions'
    ),
    commits: normalizeNumber(row.commits, 'daily_rollups.commits'),
    pushes: normalizeNumber(row.pushes, 'daily_rollups.pushes'),
    focusMinutes: normalizeNumber(
      row.focus_minutes,
      'daily_rollups.focus_minutes'
    ),
    filesTouched: normalizeNumber(
      row.files_touched,
      'daily_rollups.files_touched'
    ),
    languagesTouched: normalizeNumber(
      row.languages_touched,
      'daily_rollups.languages_touched'
    ),
    score: normalizeNumber(row.score, 'daily_rollups.score'),
  };
}

function mapAchievement(row: AchievementRow): Achievement {
  return {
    kind: row.kind,
    unlockedAt: normalizeTimestamp(
      row.unlocked_at_utc,
      'achievements.unlocked_at_utc'
    ),
    day: normalizeNullableDate(row.day, 'achievements.day'),
    reason: row.reason,
  };
}

function mapSetting(row: SettingRow): SettingRecord {
  return {
    key: row.key,
    valueJson: row.value_json,
    updatedAt: normalizeTimestamp(
      row.updated_at_utc,
      'settings.updated_at_utc'
    ),
  };
}

export async function replaceFocusSessions(
  sql: PostgresClient,
  sessions: readonly FocusSession[]
) {
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as PostgresClient;
    await tx`delete from focus_sessions`;

    for (const session of sessions) {
      await tx`
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
          ${normalizeUuid(session.id, 'focusSession.id')},
          ${normalizeTimestamp(session.startedAt, 'focusSession.startedAt')},
          ${normalizeTimestamp(session.endedAt, 'focusSession.endedAt')},
          ${session.activeMinutes},
          ${jsonb(
            tx,
            session.repoIds.map((value) =>
              normalizeUuid(value, 'focusSession.repoIds[]')
            )
          )},
          ${session.eventCount},
          ${session.totalChangedLines}
        )
      `;
    }
  });
}

export async function listFocusSessions(sql: PostgresClient, limit: number) {
  const rows = await sql<FocusSessionRow[]>`
    select
      id,
      started_at_utc,
      ended_at_utc,
      active_minutes,
      repo_ids,
      event_count,
      total_changed_lines
    from focus_sessions
    order by started_at_utc desc
    limit ${assertLimit(limit)}
  `;

  return rows.map(mapFocusSession);
}

export async function replaceDailyRollups(
  sql: PostgresClient,
  rollups: readonly DailyRollup[]
) {
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as PostgresClient;
    await tx`delete from daily_rollups`;

    for (const rollup of rollups) {
      await tx`
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
          ${rollup.scope},
          ${normalizeDate(rollup.day, 'dailyRollup.day')},
          ${rollup.liveAdditions},
          ${rollup.liveDeletions},
          ${rollup.stagedAdditions},
          ${rollup.stagedDeletions},
          ${rollup.committedAdditions},
          ${rollup.committedDeletions},
          ${rollup.commits},
          ${rollup.pushes},
          ${rollup.focusMinutes},
          ${rollup.filesTouched},
          ${rollup.languagesTouched},
          ${rollup.score}
        )
      `;
    }
  });
}

export async function listDailyRollups(
  sql: PostgresClient,
  repoId: string | null,
  days: number
) {
  const scope = repoId ? normalizeUuid(repoId, 'repoId') : 'all';
  const rows = await sql<DailyRollupRow[]>`
    select
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
    from daily_rollups
    where scope = ${scope}
    order by day desc
    limit ${assertLimit(days, 'days')}
  `;

  return rows.map(mapDailyRollup);
}

export async function allRollupsForScope(sql: PostgresClient, scope: string) {
  const rows = await sql<DailyRollupRow[]>`
    select
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
    from daily_rollups
    where scope = ${scope}
    order by day asc
  `;

  return rows.map(mapDailyRollup);
}

export async function replaceAchievements(
  sql: PostgresClient,
  achievements: readonly Achievement[]
) {
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as PostgresClient;
    await tx`delete from achievements`;

    for (const achievement of achievements) {
      await tx`
        insert into achievements (
          kind,
          unlocked_at_utc,
          day,
          reason
        )
        values (
          ${achievement.kind},
          ${normalizeTimestamp(achievement.unlockedAt, 'achievement.unlockedAt')},
          ${normalizeNullableDate(achievement.day, 'achievement.day')},
          ${achievement.reason}
        )
        on conflict (kind) do nothing
      `;
    }
  });
}

export async function listAchievements(sql: PostgresClient) {
  const rows = await sql<AchievementRow[]>`
    select kind, unlocked_at_utc, day, reason
    from achievements
    order by unlocked_at_utc asc
  `;

  return rows.map(mapAchievement);
}

export async function upsertSetting(
  sql: PostgresClient,
  key: string,
  valueJson: unknown,
  updatedAt = new Date()
) {
  await sql`
    insert into settings (key, value_json, updated_at_utc)
    values (
      ${key},
      ${jsonb(sql, valueJson)},
      ${normalizeTimestamp(updatedAt, 'settings.updatedAt')}
    )
    on conflict (key) do update set
      value_json = excluded.value_json,
      updated_at_utc = excluded.updated_at_utc
  `;
}

export async function listSettings(sql: PostgresClient) {
  const rows = await sql<SettingRow[]>`
    select key, value_json, updated_at_utc
    from settings
    order by key asc
  `;

  return rows.map(mapSetting);
}

export function normalizeAnalyticsTimestamp(
  value: Date | string | null | undefined
) {
  return normalizeNullableTimestamp(value, 'analytics.timestamp');
}
