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
} from '../domain';
import {
  allCommitsForAnalytics,
  allFileActivityForAnalytics,
  allPushEventsForAnalytics,
  insertCommits,
  insertFileActivity,
  insertPushEvent,
  listCommits,
  listPushEvents,
  recentActivityFeed,
  topFilesTouched,
} from './activity';
import {
  allRollupsForScope,
  listAchievements,
  listDailyRollups,
  listFocusSessions,
  listSettings,
  replaceAchievements,
  replaceDailyRollups,
  replaceFocusSessions,
  upsertSetting,
} from './analytics';
import type { PostgresClient } from './support';
import {
  allSnapshotsForAnalytics,
  findRepository,
  getRepository,
  insertSnapshot,
  latestSnapshot,
  listRepositories,
  listTrackedTargets,
  recentSnapshots,
  setRepositoryPatterns,
  setRepositoryState,
  upsertRepository,
  upsertTrackedTarget,
} from './tracked-repositories';

export class PostgresGitPulseStore {
  constructor(private readonly sql: PostgresClient) {}

  upsertTrackedTarget(target: TrackedTarget) {
    return upsertTrackedTarget(this.sql, target);
  }

  listTrackedTargets() {
    return listTrackedTargets(this.sql);
  }

  upsertRepository(repository: Repository) {
    return upsertRepository(this.sql, repository);
  }

  listRepositories() {
    return listRepositories(this.sql);
  }

  getRepository(id: string) {
    return getRepository(this.sql, id);
  }

  findRepository(selector: string) {
    return findRepository(this.sql, selector);
  }

  setRepositoryState(
    id: string,
    state: Repository['state'],
    isMonitored: boolean
  ) {
    return setRepositoryState(this.sql, id, state, isMonitored);
  }

  setRepositoryPatterns(
    id: string,
    includePatterns: string[],
    excludePatterns: string[]
  ) {
    return setRepositoryPatterns(
      this.sql,
      id,
      includePatterns,
      excludePatterns
    );
  }

  insertSnapshot(snapshot: RepoStatusSnapshot) {
    return insertSnapshot(this.sql, snapshot);
  }

  latestSnapshot(repoId: string) {
    return latestSnapshot(this.sql, repoId);
  }

  recentSnapshots(repoId: string, limit: number) {
    return recentSnapshots(this.sql, repoId, limit);
  }

  allSnapshotsForAnalytics() {
    return allSnapshotsForAnalytics(this.sql);
  }

  insertFileActivity(events: readonly FileActivityEvent[]) {
    return insertFileActivity(this.sql, events);
  }

  topFilesTouched(repoId: string | null, limit: number) {
    return topFilesTouched(this.sql, repoId, limit);
  }

  allFileActivityForAnalytics() {
    return allFileActivityForAnalytics(this.sql);
  }

  insertCommits(commits: readonly CommitEvent[]) {
    return insertCommits(this.sql, commits);
  }

  listCommits(repoId: string | null, limit: number) {
    return listCommits(this.sql, repoId, limit);
  }

  allCommitsForAnalytics() {
    return allCommitsForAnalytics(this.sql);
  }

  insertPushEvent(push: PushEvent) {
    return insertPushEvent(this.sql, push);
  }

  listPushEvents(repoId: string | null, limit: number) {
    return listPushEvents(this.sql, repoId, limit);
  }

  allPushEventsForAnalytics() {
    return allPushEventsForAnalytics(this.sql);
  }

  recentActivityFeed(limit: number) {
    return recentActivityFeed(this.sql, limit);
  }

  replaceFocusSessions(sessions: readonly FocusSession[]) {
    return replaceFocusSessions(this.sql, sessions);
  }

  listFocusSessions(limit: number) {
    return listFocusSessions(this.sql, limit);
  }

  replaceDailyRollups(rollups: readonly DailyRollup[]) {
    return replaceDailyRollups(this.sql, rollups);
  }

  listDailyRollups(repoId: string | null, days: number) {
    return listDailyRollups(this.sql, repoId, days);
  }

  allRollupsForScope(scope: string) {
    return allRollupsForScope(this.sql, scope);
  }

  replaceAchievements(achievements: readonly Achievement[]) {
    return replaceAchievements(this.sql, achievements);
  }

  listAchievements() {
    return listAchievements(this.sql);
  }

  upsertSetting(key: string, valueJson: unknown, updatedAt?: Date) {
    return upsertSetting(this.sql, key, valueJson, updatedAt);
  }

  listSettings() {
    return listSettings(this.sql);
  }
}

export function createPostgresGitPulseStore(sql: PostgresClient) {
  return new PostgresGitPulseStore(sql);
}
