import { type ApiEnv, databaseHostFromUrl } from '@gitpulse-vnext/config';
import {
  dashboardResponseSchema,
  healthResponseSchema,
  manualActionIds,
  primarySurfaceIds,
  repositoriesResponseSchema,
} from '@gitpulse-vnext/contracts';
import { activityLedgerIds } from '@gitpulse-vnext/core';
import { Elysia } from 'elysia';

import { type ApiReadModels, createPostgresApiReadModels } from './read-models';

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
    );
}
