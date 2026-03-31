import { expect, test } from 'bun:test';

import { createApp } from '../src/app';

const env = {
  GITPULSE_API_HOST: '127.0.0.1',
  GITPULSE_API_PORT: 3001,
  GITPULSE_DATABASE_URL: 'postgres://gitpulse:gitpulse@postgres:5432/gitpulse',
  GITPULSE_CONFIG_DIR: '/var/lib/gitpulse/config',
  GITPULSE_DATA_DIR: '/var/lib/gitpulse/data',
} as const;

test('GET /api/health returns the bootstrap contract', async () => {
  const app = createApp(env);

  const response = await app.handle(
    new Request('http://gitpulse.local/api/health')
  );
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(payload.status).toBe('ok');
  expect(payload.databaseHost).toBe('postgres');
  expect(payload.manualActions).toContain('rebuild_analytics');
});

test('read routes return Zod-owned payloads', async () => {
  const app = createApp(env, {
    readModels: {
      async getDashboard() {
        return {
          summary: {
            live_lines: 12,
            staged_lines: 4,
            commits_today: 1,
            pushes_today: 0,
            active_session_minutes: 15,
            streak_days: 2,
            best_streak_days: 3,
            today_score: 88,
            goals: [
              {
                label: 'Changed Lines',
                current: 12,
                target: 250,
                percent: 4.8,
              },
              {
                label: 'Commits',
                current: 1,
                target: 3,
                percent: 33.33333333333333,
              },
              {
                label: 'Focus Minutes',
                current: 15,
                target: 90,
                percent: 16.666666666666664,
              },
            ],
          },
          activity_feed: [],
          trend_points: [],
          heatmap_days: [],
          repo_cards: [],
        };
      },
      async getRepositories() {
        return {
          repositories: [],
        };
      },
      async getRepositoryDetail() {
        return {
          card: {
            repo: {
              id: '22222222-2222-4222-8222-222222222222',
              target_id: '11111111-1111-4111-8111-111111111111',
              name: 'gitpulse',
              root_path: '/tmp/gitpulse-fixtures/gitpulse',
              remote_url: 'git@github.com-dunamismax:dunamismax/gitpulse.git',
              default_branch: 'main',
              include_patterns: ['apps/**'],
              exclude_patterns: ['node_modules/**'],
              is_monitored: true,
              state: 'active',
              created_at: '2026-03-31T13:00:00.000Z',
              updated_at: '2026-03-31T13:05:00.000Z',
              last_error: null,
            },
            snapshot: null,
            health: 'Error',
            metrics: null,
            sparkline: [],
          },
          include_patterns: ['apps/**'],
          exclude_patterns: ['node_modules/**'],
          recent_commits: [],
          recent_pushes: [],
          recent_sessions: [],
          language_breakdown: [],
          top_files: [],
        };
      },
      async getSessions() {
        return {
          sessions: [],
          total_minutes: 15,
          average_length_minutes: 15,
          longest_session_minutes: 15,
        };
      },
      async getAchievements() {
        return {
          achievements: [],
          streaks: {
            current_days: 2,
            best_days: 3,
          },
          today_score: 88,
        };
      },
      async getSettings() {
        return {
          config: {
            authors: [{ email: 'stephen@example.com', name: 'Stephen Sawyer' }],
            goals: {
              changed_lines_per_day: 250,
              commits_per_day: 3,
              focus_minutes_per_day: 90,
            },
            patterns: {
              include: ['apps/**'],
              exclude: ['node_modules/**'],
            },
            github: {
              enabled: false,
              token: null,
              verify_remote_pushes: false,
            },
            monitoring: {
              import_days: 30,
              session_gap_minutes: 15,
              repo_discovery_depth: 5,
            },
            ui: {
              timezone: 'UTC',
              day_boundary_minutes: 0,
            },
          },
          paths: {
            config_dir: '/var/lib/gitpulse/config',
            data_dir: '/var/lib/gitpulse/data',
            config_file: '/var/lib/gitpulse/config/gitpulse.toml',
          },
        };
      },
    },
  });

  const dashboardResponse = await app.handle(
    new Request('http://gitpulse.local/api/dashboard')
  );
  const dashboardPayload = await dashboardResponse.json();

  expect(dashboardResponse.status).toBe(200);
  expect(dashboardPayload.data.summary.today_score).toBe(88);
  expect(dashboardPayload.data.summary.goals).toHaveLength(3);

  const repositoriesResponse = await app.handle(
    new Request('http://gitpulse.local/api/repositories')
  );
  const repositoriesPayload = await repositoriesResponse.json();

  expect(repositoriesResponse.status).toBe(200);
  expect(repositoriesPayload.data.repositories).toEqual([]);

  const detailResponse = await app.handle(
    new Request(
      'http://gitpulse.local/api/repositories/22222222-2222-4222-8222-222222222222'
    )
  );
  const detailPayload = await detailResponse.json();

  expect(detailResponse.status).toBe(200);
  expect(detailPayload.data.card.repo.name).toBe('gitpulse');

  const sessionsResponse = await app.handle(
    new Request('http://gitpulse.local/api/sessions')
  );
  const sessionsPayload = await sessionsResponse.json();

  expect(sessionsResponse.status).toBe(200);
  expect(sessionsPayload.data.total_minutes).toBe(15);

  const achievementsResponse = await app.handle(
    new Request('http://gitpulse.local/api/achievements')
  );
  const achievementsPayload = await achievementsResponse.json();

  expect(achievementsResponse.status).toBe(200);
  expect(achievementsPayload.data.streaks.current_days).toBe(2);

  const settingsResponse = await app.handle(
    new Request('http://gitpulse.local/api/settings')
  );
  const settingsPayload = await settingsResponse.json();

  expect(settingsResponse.status).toBe(200);
  expect(settingsPayload.data.paths.config_file).toBe(
    '/var/lib/gitpulse/config/gitpulse.toml'
  );
  expect(settingsPayload.data.config.goals.changed_lines_per_day).toBe(250);
});

test('GET /api/repositories/:id returns 404 when the repository is missing', async () => {
  const app = createApp(env, {
    readModels: {
      async getDashboard() {
        throw new Error('not used');
      },
      async getRepositories() {
        throw new Error('not used');
      },
      async getRepositoryDetail() {
        return null;
      },
      async getSessions() {
        throw new Error('not used');
      },
      async getAchievements() {
        throw new Error('not used');
      },
      async getSettings() {
        throw new Error('not used');
      },
    },
  });

  const response = await app.handle(
    new Request('http://gitpulse.local/api/repositories/missing')
  );
  const payload = await response.json();

  expect(response.status).toBe(404);
  expect(payload.error).toBe('repository not found');
});

test('action routes return Zod-owned payloads and validation errors', async () => {
  const app = createApp(env, {
    readModels: {
      async getDashboard() {
        throw new Error('not used');
      },
      async getRepositories() {
        throw new Error('not used');
      },
      async getRepositoryDetail() {
        throw new Error('not used');
      },
      async getSessions() {
        throw new Error('not used');
      },
      async getAchievements() {
        throw new Error('not used');
      },
      async getSettings() {
        throw new Error('not used');
      },
    },
    actions: {
      async addTarget(path) {
        return {
          result: {
            action: 'add_target',
            title: 'Target registration finished',
            summary: `Registered repositories from ${path}.`,
            lines: ['Repositories registered: 1'],
          },
          repositories: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              target_id: '11111111-1111-4111-8111-111111111111',
              name: 'gitpulse',
              root_path: '/tmp/gitpulse-fixtures/gitpulse',
              remote_url: null,
              default_branch: 'main',
              include_patterns: [],
              exclude_patterns: ['node_modules/**'],
              is_monitored: true,
              state: 'active',
              created_at: '2026-03-31T13:00:00.000Z',
              updated_at: '2026-03-31T13:00:00.000Z',
              last_error: null,
            },
          ],
        };
      },
      async refreshRepository() {
        return {
          result: {
            action: 'refresh_repo',
            title: 'Repository refresh finished',
            summary: 'Refreshed live git state for gitpulse.',
            lines: ['Live working-tree state refreshed from local git data.'],
          },
          repository_card: {
            repo: {
              id: '22222222-2222-4222-8222-222222222222',
              target_id: '11111111-1111-4111-8111-111111111111',
              name: 'gitpulse',
              root_path: '/tmp/gitpulse-fixtures/gitpulse',
              remote_url: null,
              default_branch: 'main',
              include_patterns: [],
              exclude_patterns: ['node_modules/**'],
              is_monitored: true,
              state: 'active',
              created_at: '2026-03-31T13:00:00.000Z',
              updated_at: '2026-03-31T13:00:00.000Z',
              last_error: null,
            },
            snapshot: null,
            health: 'Error',
            metrics: null,
            sparkline: [],
          },
        };
      },
      async toggleRepository() {
        return {
          result: {
            action: 'toggle_repo',
            title: 'Repository monitoring updated',
            summary: 'Updated monitoring state for gitpulse.',
            lines: ['State: disabled', 'Monitored: false'],
          },
          repository: {
            id: '22222222-2222-4222-8222-222222222222',
            target_id: '11111111-1111-4111-8111-111111111111',
            name: 'gitpulse',
            root_path: '/tmp/gitpulse-fixtures/gitpulse',
            remote_url: null,
            default_branch: 'main',
            include_patterns: [],
            exclude_patterns: ['node_modules/**'],
            is_monitored: false,
            state: 'disabled',
            created_at: '2026-03-31T13:00:00.000Z',
            updated_at: '2026-03-31T13:00:00.000Z',
            last_error: null,
          },
        };
      },
      async removeRepository() {
        return {
          result: {
            action: 'remove_repo',
            title: 'Repository removed',
            summary: 'Removed gitpulse from the active operator set.',
            lines: ['State: removed'],
          },
        };
      },
      async saveRepositoryPatterns() {
        return {
          result: {
            action: 'save_repo_patterns',
            title: 'Repository patterns saved',
            summary: 'Saved include and exclude patterns for gitpulse.',
            lines: ['Include patterns: 1', 'Exclude patterns: 1'],
          },
        };
      },
      async importRepository(_id, days) {
        return {
          result: {
            action: 'import_repo',
            title: 'Repository import finished',
            summary: 'Imported 2 commits for gitpulse.',
            lines: [`Window: last ${days ?? 30} days`],
          },
        };
      },
      async importAll(days) {
        return {
          result: {
            action: 'import_all',
            title: 'History import finished',
            summary: 'Imported 2 commits across 1 repository.',
            lines: [`Window: last ${days ?? 30} days`],
            warnings: [],
          },
        };
      },
      async rescanAll() {
        return {
          result: {
            action: 'rescan_all',
            title: 'Repository rescan finished',
            summary: 'Rescanned 1 active repository.',
            lines: ['Active monitored repositories: 1'],
            warnings: [],
          },
        };
      },
      async rebuildAnalytics() {
        return {
          result: {
            action: 'rebuild_analytics',
            title: 'Analytics rebuild finished',
            summary: 'Rebuilt sessions, rollups, and achievements.',
            lines: [
              'Sessions written: 1',
              'Rollups written: 1',
              'Achievements written: 1',
            ],
          },
        };
      },
      async saveSettings() {
        return {
          result: {
            action: 'save_settings',
            title: 'Settings saved',
            summary: 'Saved GitPulse settings.',
            lines: ['Timezone: UTC'],
          },
          settings: {
            config: {
              authors: [{ email: 'stephen@example.com' }],
              goals: {
                changed_lines_per_day: 250,
                commits_per_day: 3,
                focus_minutes_per_day: 90,
              },
              patterns: {
                include: [],
                exclude: ['node_modules/**'],
              },
              github: {
                enabled: false,
                token: null,
                verify_remote_pushes: false,
              },
              monitoring: {
                import_days: 30,
                session_gap_minutes: 15,
                repo_discovery_depth: 5,
              },
              ui: {
                timezone: 'UTC',
                day_boundary_minutes: 0,
              },
            },
            paths: {
              config_dir: '/var/lib/gitpulse/config',
              data_dir: '/var/lib/gitpulse/data',
              config_file: '/var/lib/gitpulse/config/gitpulse.toml',
            },
          },
        };
      },
    },
  });

  const addResponse = await app.handle(
    new Request('http://gitpulse.local/api/repositories/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/tmp/gitpulse-fixtures' }),
    })
  );
  const addPayload = await addResponse.json();
  expect(addResponse.status).toBe(200);
  expect(addPayload.data.result.action).toBe('add_target');
  expect(addPayload.data.repositories).toHaveLength(1);

  const refreshResponse = await app.handle(
    new Request(
      'http://gitpulse.local/api/repositories/22222222-2222-4222-8222-222222222222/refresh',
      {
        method: 'POST',
      }
    )
  );
  const refreshPayload = await refreshResponse.json();
  expect(refreshResponse.status).toBe(200);
  expect(refreshPayload.data.result.action).toBe('refresh_repo');
  expect(refreshPayload.data.repository_card.repo.name).toBe('gitpulse');

  const badPatternsResponse = await app.handle(
    new Request(
      'http://gitpulse.local/api/repositories/22222222-2222-4222-8222-222222222222/patterns',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ include_patterns: ['apps/**'] }),
      }
    )
  );
  const badPatternsPayload = await badPatternsResponse.json();
  expect(badPatternsResponse.status).toBe(400);
  expect(badPatternsPayload.error).toContain('expected array');

  const rebuildResponse = await app.handle(
    new Request('http://gitpulse.local/api/actions/rebuild', {
      method: 'POST',
    })
  );
  const rebuildPayload = await rebuildResponse.json();
  expect(rebuildResponse.status).toBe(200);
  expect(rebuildPayload.data.result.action).toBe('rebuild_analytics');

  const settingsResponse = await app.handle(
    new Request('http://gitpulse.local/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        authors: ['stephen@example.com'],
        changed_lines_per_day: 250,
        commits_per_day: 3,
        focus_minutes_per_day: 90,
        timezone: 'UTC',
        day_boundary_minutes: 0,
        session_gap_minutes: 15,
        import_days: 30,
        include_patterns: [],
        exclude_patterns: ['node_modules/**'],
        github_enabled: false,
        github_verify_remote_pushes: false,
        github_token: '',
      }),
    })
  );
  const settingsPayload = await settingsResponse.json();
  expect(settingsResponse.status).toBe(200);
  expect(settingsPayload.data.result.action).toBe('save_settings');
  expect(settingsPayload.data.settings.paths.config_file).toBe(
    '/var/lib/gitpulse/config/gitpulse.toml'
  );
});
