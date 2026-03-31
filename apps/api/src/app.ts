import { type ApiEnv, databaseHostFromUrl } from '@gitpulse-vnext/config';
import {
  achievementsResponseSchema,
  dashboardResponseSchema,
  healthResponseSchema,
  manualActionIds,
  primarySurfaceIds,
  repoDetailResponseSchema,
  repositoriesResponseSchema,
  sessionsResponseSchema,
  settingsResponseSchema,
} from '@gitpulse-vnext/contracts';
import { activityLedgerIds } from '@gitpulse-vnext/core';
import { Elysia } from 'elysia';

import { type ApiReadModels, createPostgresApiReadModels } from './read-models';

function notFound(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export function createApp(
  env: ApiEnv,
  options: { readModels?: ApiReadModels } = {}
) {
  const readModels = options.readModels ?? createPostgresApiReadModels(env);

  return new Elysia()
    .get('/api/health', () =>
      healthResponseSchema.parse({
        status: 'ok',
        service: 'gitpulse-vnext-api',
        ledgers: [...activityLedgerIds],
        surfaces: [...primarySurfaceIds],
        manualActions: [...manualActionIds],
        databaseHost: databaseHostFromUrl(env.GITPULSE_DATABASE_URL),
      })
    )
    .get('/api/dashboard', async () =>
      dashboardResponseSchema.parse({
        data: await readModels.getDashboard(),
      })
    )
    .get('/api/repositories', async () =>
      repositoriesResponseSchema.parse({
        data: await readModels.getRepositories(),
      })
    )
    .get('/api/repositories/:id', async ({ params }) => {
      const detail = await readModels.getRepositoryDetail(params.id);
      if (!detail) {
        return notFound('repository not found');
      }

      return repoDetailResponseSchema.parse({
        data: detail,
      });
    })
    .get('/api/sessions', async () =>
      sessionsResponseSchema.parse({
        data: await readModels.getSessions(),
      })
    )
    .get('/api/achievements', async () =>
      achievementsResponseSchema.parse({
        data: await readModels.getAchievements(),
      })
    )
    .get('/api/settings', async () =>
      settingsResponseSchema.parse({
        data: await readModels.getSettings(),
      })
    );
}
