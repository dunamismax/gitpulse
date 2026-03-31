import { resolve } from 'node:path';

import type { ApiEnv } from '@gitpulse-vnext/config';
import type {
  ActionPayload,
  SaveSettingsRequest,
  SettingsView,
} from '@gitpulse-vnext/contracts';
import {
  createPostgresClient,
  createPostgresGitPulseStore,
  createShellGitBackend,
  type GitBackend,
  type ImportedHistoryCommit,
  type PostgresGitPulseStore,
  type Repository,
  rebuildAnalytics,
} from '@gitpulse-vnext/core';

import { buildRepoCard, mapRepository, todayKey } from './read-models';
import { loadSettingsView } from './settings';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface ApiActions {
  addTarget(path: string): Promise<ActionPayload>;
  refreshRepository(id: string): Promise<ActionPayload>;
  toggleRepository(id: string): Promise<ActionPayload>;
  removeRepository(id: string): Promise<ActionPayload>;
  saveRepositoryPatterns(
    id: string,
    includePatterns: string[],
    excludePatterns: string[]
  ): Promise<ActionPayload>;
  importRepository(id: string, days?: number): Promise<ActionPayload>;
  importAll(days?: number): Promise<ActionPayload>;
  rescanAll(): Promise<ActionPayload>;
  rebuildAnalytics(): Promise<ActionPayload>;
  saveSettings(input: SaveSettingsRequest): Promise<ActionPayload>;
}

function pluralize(count: number, noun = 'commit') {
  return count === 1 ? noun : `${noun}s`;
}

function pluralizeRepository(count: number) {
  return count === 1 ? 'repository' : 'repositories';
}

function normalizeUuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ) {
    throw new HttpError(400, 'invalid id');
  }

  return value.toLowerCase();
}

function trimPath(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    throw new HttpError(400, 'path is required');
  }

  return resolve(normalized);
}

function coerceDays(days: number | undefined, fallback: number) {
  if (!Number.isInteger(days) || days == null || days < 1) {
    return fallback;
  }

  return days;
}

async function requireRepository(store: PostgresGitPulseStore, id: string) {
  const repository = await store.getRepository(id);
  if (!repository) {
    throw new HttpError(404, 'repository not found');
  }

  return repository;
}

function resolveRepoPatterns(repository: Repository, settings: SettingsView) {
  return {
    includePatterns:
      repository.includePatterns.length > 0
        ? repository.includePatterns
        : settings.config.patterns.include,
    excludePatterns:
      repository.excludePatterns.length > 0
        ? repository.excludePatterns
        : settings.config.patterns.exclude,
  };
}

function authorEmails(settings: SettingsView) {
  return settings.config.authors.flatMap((author) => {
    const emails = [author.email];
    if (author.aliases) {
      emails.push(...author.aliases);
    }
    return emails
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0);
  });
}

function mapImportedCommits(
  repoId: string,
  importedAt: Date,
  commits: readonly ImportedHistoryCommit[],
  idGenerator: () => string
) {
  return commits.map((commit) => ({
    id: idGenerator(),
    repoId,
    commitSha: commit.commitSha,
    authoredAt: commit.authoredAt,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    summary: commit.summary,
    branch: commit.branch,
    additions: commit.additions,
    deletions: commit.deletions,
    filesChanged: commit.filesChanged,
    isMerge: commit.isMerge,
    importedAt,
  }));
}

function mapImportedFileActivity(
  repoId: string,
  commits: readonly ImportedHistoryCommit[],
  idGenerator: () => string
) {
  return commits.flatMap((commit) =>
    commit.touchedPaths.map((path) => ({
      id: idGenerator(),
      repoId,
      observedAt: commit.authoredAt,
      relativePath: path.path,
      additions: path.additions,
      deletions: path.deletions,
      kind: 'import' as const,
    }))
  );
}

async function refreshRepositoryInternal(
  store: PostgresGitPulseStore,
  git: GitBackend,
  env: ApiEnv,
  id: string,
  options: { includeSizeScan: boolean; now: Date; idGenerator: () => string }
) {
  const repository = await requireRepository(store, id);
  const settings = await loadSettingsView(store, env);
  const { includePatterns, excludePatterns } = resolveRepoPatterns(
    repository,
    settings
  );
  const previousSnapshot = await store.latestSnapshot(repository.id);
  const snapshot = await git.snapshotRepository(repository.rootPath, {
    includePatterns,
    excludePatterns,
    includeSizeScan: options.includeSizeScan,
  });

  if (
    previousSnapshot &&
    previousSnapshot.aheadCount > snapshot.aheadCount &&
    snapshot.upstreamRef
  ) {
    await store.insertPushEvent({
      id: options.idGenerator(),
      repoId: repository.id,
      observedAt: options.now,
      kind: 'push_detected_local',
      headSha: snapshot.headSha,
      pushedCommitCount: previousSnapshot.aheadCount - snapshot.aheadCount,
      upstreamRef: snapshot.upstreamRef,
      notes: null,
    });
  }

  if (snapshot.touchedPaths.length > 0) {
    await store.insertFileActivity(
      snapshot.touchedPaths.map((path) => ({
        id: options.idGenerator(),
        repoId: repository.id,
        observedAt: options.now,
        relativePath: path.path,
        additions: path.additions,
        deletions: path.deletions,
        kind: 'refresh',
      }))
    );
  }

  await store.insertSnapshot({
    id: options.idGenerator(),
    repoId: repository.id,
    observedAt: options.now,
    branch: snapshot.branch,
    isDetached: snapshot.isDetached,
    headSha: snapshot.headSha,
    upstreamRef: snapshot.upstreamRef,
    upstreamHeadSha: snapshot.upstreamHeadSha,
    aheadCount: snapshot.aheadCount,
    behindCount: snapshot.behindCount,
    liveAdditions: snapshot.liveStats.additions,
    liveDeletions: snapshot.liveStats.deletions,
    liveFiles: snapshot.liveStats.fileCount,
    stagedAdditions: snapshot.stagedStats.additions,
    stagedDeletions: snapshot.stagedStats.deletions,
    stagedFiles: snapshot.stagedStats.fileCount,
    filesTouched: snapshot.touchedPaths.length,
    repoSizeBytes: snapshot.repoSizeBytes,
    languageBreakdown: snapshot.languageBreakdown,
  });

  const card = await buildRepoCard(store, repository, todayKey(options.now));
  return {
    repository,
    card,
  };
}

async function importRepositoryInternal(
  store: PostgresGitPulseStore,
  git: GitBackend,
  env: ApiEnv,
  id: string,
  days: number | undefined,
  options: { now: Date; idGenerator: () => string }
) {
  const repository = await requireRepository(store, id);
  const settings = await loadSettingsView(store, env);
  const effectiveDays = coerceDays(
    days,
    settings.config.monitoring.import_days
  );
  const { includePatterns, excludePatterns } = resolveRepoPatterns(
    repository,
    settings
  );
  const commits = await git.importHistory(repository.rootPath, {
    days: effectiveDays,
    authorEmails: authorEmails(settings),
    includePatterns,
    excludePatterns,
  });
  const importedAt = options.now;

  const inserted = await store.insertCommits(
    mapImportedCommits(repository.id, importedAt, commits, options.idGenerator)
  );
  const fileActivity = mapImportedFileActivity(
    repository.id,
    commits,
    options.idGenerator
  );
  if (fileActivity.length > 0) {
    await store.insertFileActivity(fileActivity);
  }

  return {
    repository,
    days: effectiveDays,
    inserted,
  };
}

export function createApiActions(
  store: PostgresGitPulseStore,
  env: ApiEnv,
  options: {
    git?: GitBackend;
    now?: () => Date;
    idGenerator?: () => string;
  } = {}
): ApiActions {
  const git = options.git ?? createShellGitBackend();
  const nowFactory = options.now ?? (() => new Date());
  const idGenerator = options.idGenerator ?? (() => crypto.randomUUID());

  return {
    async addTarget(path) {
      const resolvedPath = trimPath(path);
      const settings = await loadSettingsView(store, env);
      const roots = await git.discoverRepositories(
        resolvedPath,
        settings.config.monitoring.repo_discovery_depth ?? 5
      );

      if (roots.length === 0) {
        throw new HttpError(
          500,
          `failed to add repository: no git repositories found at ${resolvedPath}`
        );
      }

      const now = nowFactory();
      const targetId = idGenerator();
      await store.upsertTrackedTarget({
        id: targetId,
        path: resolvedPath,
        kind: roots.length > 1 ? 'folder' : 'repo',
        createdAt: now,
        lastScanAt: null,
      });

      const repositories: Repository[] = [];
      for (const root of roots) {
        const probe = await git.probeRepository(root);
        await store.upsertRepository({
          id: idGenerator(),
          targetId,
          name: probe.name,
          rootPath: root,
          remoteUrl: probe.remoteUrl,
          defaultBranch: probe.defaultBranch,
          includePatterns: settings.config.patterns.include,
          excludePatterns: settings.config.patterns.exclude,
          isMonitored: true,
          state: 'active',
          createdAt: now,
          updatedAt: now,
          lastError: null,
        });

        const saved = await store.findRepository(root);
        if (saved) {
          repositories.push(saved);
        }
      }

      return {
        result: {
          action: 'add_target',
          title: 'Target registration finished',
          summary: `Registered ${repositories.length} ${pluralizeRepository(repositories.length)} from ${resolvedPath}.`,
          lines: [
            `Repositories registered: ${repositories.length}`,
            `Root path: ${resolvedPath}`,
            'Import, rescan, and rebuild remain explicit follow-up steps.',
          ],
        },
        repositories: repositories.map(mapRepository),
      };
    },

    async refreshRepository(id) {
      const normalizedId = normalizeUuid(id);
      const now = nowFactory();
      const { repository, card } = await refreshRepositoryInternal(
        store,
        git,
        env,
        normalizedId,
        {
          includeSizeScan: true,
          now,
          idGenerator,
        }
      );

      return {
        result: {
          action: 'refresh_repo',
          title: 'Repository refresh finished',
          summary: `Refreshed live git state for ${repository.name}.`,
          lines: [
            'Live working-tree state refreshed from local git data.',
            'Import and rebuild remain explicit follow-up actions.',
          ],
        },
        repository_card: card,
      };
    },

    async toggleRepository(id) {
      const normalizedId = normalizeUuid(id);
      const repository = await requireRepository(store, normalizedId);
      const nextState = repository.state === 'active' ? 'disabled' : 'active';
      const isMonitored = nextState === 'active';
      await store.setRepositoryState(normalizedId, nextState, isMonitored);
      const updated = await requireRepository(store, normalizedId);

      return {
        result: {
          action: 'toggle_repo',
          title: 'Repository monitoring updated',
          summary: `Updated monitoring state for ${updated.name}.`,
          lines: [
            `State: ${updated.state}`,
            `Monitored: ${updated.isMonitored}`,
          ],
        },
        repository: mapRepository(updated),
      };
    },

    async removeRepository(id) {
      const normalizedId = normalizeUuid(id);
      const repository = await requireRepository(store, normalizedId);
      await store.setRepositoryState(normalizedId, 'removed', false);
      const updated = await requireRepository(store, normalizedId);

      return {
        result: {
          action: 'remove_repo',
          title: 'Repository removed',
          summary: `Removed ${repository.name} from the active operator set.`,
          lines: [
            `State: ${updated.state}`,
            'History and snapshots remain in the local database until rebuilt or inspected.',
          ],
        },
        repository: mapRepository(updated),
      };
    },

    async saveRepositoryPatterns(id, includePatterns, excludePatterns) {
      const normalizedId = normalizeUuid(id);
      const repository = await requireRepository(store, normalizedId);
      await store.setRepositoryPatterns(
        normalizedId,
        includePatterns,
        excludePatterns
      );
      const updated = await requireRepository(store, normalizedId);

      return {
        result: {
          action: 'save_repo_patterns',
          title: 'Repository patterns saved',
          summary: `Saved include and exclude patterns for ${repository.name}.`,
          lines: [
            `Include patterns: ${includePatterns.length}`,
            `Exclude patterns: ${excludePatterns.length}`,
          ],
        },
        repository: mapRepository(updated),
      };
    },

    async importRepository(id, days) {
      const normalizedId = normalizeUuid(id);
      const startedAt = nowFactory();
      const {
        repository,
        inserted,
        days: effectiveDays,
      } = await importRepositoryInternal(store, git, env, normalizedId, days, {
        now: startedAt,
        idGenerator,
      });

      return {
        result: {
          action: 'import_repo',
          title: 'Repository import finished',
          summary: `Imported ${inserted} ${pluralize(inserted)} for ${repository.name}.`,
          lines: [
            `Repository: ${repository.name}`,
            `Commits imported: ${inserted}`,
            `Window: last ${effectiveDays} ${pluralize(effectiveDays, 'day')}`,
          ],
        },
        repository: mapRepository(repository),
      };
    },

    async importAll(days) {
      const repositories = await store.listRepositories();
      const warnings: string[] = [];
      let processed = 0;
      let imported = 0;

      for (const repository of repositories) {
        if (repository.state === 'removed') {
          continue;
        }

        processed += 1;
        try {
          const result = await importRepositoryInternal(
            store,
            git,
            env,
            repository.id,
            days,
            {
              now: nowFactory(),
              idGenerator,
            }
          );
          imported += result.inserted;
        } catch (error) {
          warnings.push(
            `${repository.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const effectiveDays = coerceDays(
        days,
        (await loadSettingsView(store, env)).config.monitoring.import_days
      );

      return {
        result: {
          action: 'import_all',
          title: 'History import finished',
          summary: `Imported ${imported} ${pluralize(imported)} across ${processed} ${pluralizeRepository(processed)}.`,
          lines: [
            `Repositories processed: ${processed}`,
            `Commits imported: ${imported}`,
            `Window: last ${effectiveDays} ${pluralize(effectiveDays, 'day')}`,
          ],
          warnings,
        },
      };
    },

    async rescanAll() {
      const repositories = await store.listRepositories();
      const warnings: string[] = [];
      let processed = 0;

      for (const repository of repositories) {
        if (repository.state !== 'active' || !repository.isMonitored) {
          continue;
        }

        processed += 1;
        try {
          await refreshRepositoryInternal(store, git, env, repository.id, {
            includeSizeScan: false,
            now: nowFactory(),
            idGenerator,
          });
        } catch (error) {
          warnings.push(
            `${repository.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return {
        result: {
          action: 'rescan_all',
          title: 'Repository rescan finished',
          summary: `Rescanned ${processed} active ${pluralizeRepository(processed)}.`,
          lines: [
            `Active monitored repositories: ${processed}`,
            'Live working-tree state refreshed from local git data.',
            'Rebuild analytics separately when you want sessions, streaks, and score updated.',
          ],
          warnings,
        },
      };
    },

    async rebuildAnalytics() {
      const settings = await loadSettingsView(store, env);
      const report = await rebuildAnalytics(store, {
        sessionGapMinutes: settings.config.monitoring.session_gap_minutes,
        timezone: settings.config.ui.timezone,
        dayBoundaryMinutes: settings.config.ui.day_boundary_minutes,
        now: nowFactory(),
        idGenerator,
      });

      return {
        result: {
          action: 'rebuild_analytics',
          title: 'Analytics rebuild finished',
          summary: 'Rebuilt sessions, rollups, and achievements.',
          lines: [
            `Sessions written: ${report.sessionsWritten}`,
            `Rollups written: ${report.rollupsWritten}`,
            `Achievements written: ${report.achievementsWritten}`,
          ],
        },
      };
    },

    async saveSettings(input) {
      const current = await loadSettingsView(store, env);
      const authors = input.authors
        .map((email) => email.trim())
        .filter((email) => email.length > 0)
        .map((email) => {
          const existing = current.config.authors.find(
            (author) => author.email.toLowerCase() === email.toLowerCase()
          );
          return existing ?? { email };
        });
      const timezone = input.timezone.trim() || 'UTC';
      const githubToken = input.github_token.trim();

      const next: SettingsView = {
        ...current,
        config: {
          ...current.config,
          authors,
          goals: {
            changed_lines_per_day: input.changed_lines_per_day,
            commits_per_day: input.commits_per_day,
            focus_minutes_per_day: input.focus_minutes_per_day,
          },
          patterns: {
            include: [...input.include_patterns],
            exclude: [...input.exclude_patterns],
          },
          github: {
            enabled: input.github_enabled,
            verify_remote_pushes: input.github_verify_remote_pushes,
            token: githubToken || current.config.github.token,
          },
          monitoring: {
            ...current.config.monitoring,
            import_days: input.import_days,
            session_gap_minutes: input.session_gap_minutes,
          },
          ui: {
            timezone,
            day_boundary_minutes: input.day_boundary_minutes,
          },
        },
      };

      await Promise.all([
        store.upsertSetting('authors', next.config.authors),
        store.upsertSetting('goals', next.config.goals),
        store.upsertSetting('patterns', next.config.patterns),
        store.upsertSetting('github', next.config.github),
        store.upsertSetting('monitoring', next.config.monitoring),
        store.upsertSetting('ui', next.config.ui),
      ]);

      const updated = await loadSettingsView(store, env);
      return {
        result: {
          action: 'save_settings',
          title: 'Settings saved',
          summary: `Saved GitPulse settings to ${updated.paths.config_file}.`,
          lines: [
            `Timezone: ${updated.config.ui.timezone}`,
            `Import days: ${updated.config.monitoring.import_days}`,
            `Session gap minutes: ${updated.config.monitoring.session_gap_minutes}`,
          ],
        },
        settings: updated,
      };
    },
  };
}

export function createPostgresApiActions(
  env: ApiEnv,
  options: Parameters<typeof createApiActions>[2] = {}
) {
  const sql = createPostgresClient(env.GITPULSE_DATABASE_URL);
  const store = createPostgresGitPulseStore(sql);
  return createApiActions(store, env, options);
}
