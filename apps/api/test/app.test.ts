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
