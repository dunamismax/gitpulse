import { expect, test } from 'bun:test';

import { createApp } from '../src/app';

const env = {
  GITPULSE_API_HOST: '127.0.0.1',
  GITPULSE_API_PORT: 3001,
  GITPULSE_DATABASE_URL: 'postgres://gitpulse:gitpulse@postgres:5432/gitpulse',
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

test('GET /api/dashboard and /api/repositories return Zod-owned read payloads', async () => {
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
});
