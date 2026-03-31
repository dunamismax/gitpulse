import { type ApiEnv, databaseHostFromUrl } from '@gitpulse-vnext/config';
import {
  achievementsResponseSchema,
  actionResponseSchema,
  addTargetRequestSchema,
  dashboardResponseSchema,
  healthResponseSchema,
  importRequestSchema,
  manualActionIds,
  primarySurfaceIds,
  repoDetailResponseSchema,
  repositoriesResponseSchema,
  repositoryPatternsRequestSchema,
  saveSettingsRequestSchema,
  sessionsResponseSchema,
  settingsResponseSchema,
} from '@gitpulse-vnext/contracts';
import { activityLedgerIds } from '@gitpulse-vnext/core';
import { Elysia } from 'elysia';
import { ZodError, type ZodTypeAny, type z } from 'zod';

import {
  type ApiActions,
  createPostgresApiActions,
  HttpError,
} from './actions';
import { type ApiReadModels, createPostgresApiReadModels } from './read-models';

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

async function parseBody<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  const raw = await request.text();
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  return schema.parse(parsed);
}

function handleRouteError(error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(error.status, error.message);
  }

  if (error instanceof ZodError) {
    return jsonError(400, error.issues[0]?.message ?? 'invalid JSON body');
  }

  if (error instanceof SyntaxError) {
    return jsonError(400, 'invalid JSON body');
  }

  throw error;
}

export function createApp(
  env: ApiEnv,
  options: {
    readModels?: ApiReadModels;
    actions?: ApiActions;
  } = {}
) {
  const readModels = options.readModels ?? createPostgresApiReadModels(env);
  const actions = options.actions ?? createPostgresApiActions(env);

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
        return jsonError(404, 'repository not found');
      }

      return repoDetailResponseSchema.parse({
        data: detail,
      });
    })
    .post('/api/repositories/add', async ({ request }) => {
      try {
        const body = await parseBody(request, addTargetRequestSchema);
        return actionResponseSchema.parse({
          data: await actions.addTarget(body.path),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/repositories/:id/refresh', async ({ params }) => {
      try {
        return actionResponseSchema.parse({
          data: await actions.refreshRepository(params.id),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/repositories/:id/toggle', async ({ params }) => {
      try {
        return actionResponseSchema.parse({
          data: await actions.toggleRepository(params.id),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/repositories/:id/remove', async ({ params }) => {
      try {
        return actionResponseSchema.parse({
          data: await actions.removeRepository(params.id),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/repositories/:id/patterns', async ({ params, request }) => {
      try {
        const body = await parseBody(request, repositoryPatternsRequestSchema);
        return actionResponseSchema.parse({
          data: await actions.saveRepositoryPatterns(
            params.id,
            body.include_patterns,
            body.exclude_patterns
          ),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/repositories/:id/import', async ({ params, request }) => {
      try {
        const body = await parseBody(request, importRequestSchema);
        return actionResponseSchema.parse({
          data: await actions.importRepository(params.id, body.days),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/actions/import', async ({ request }) => {
      try {
        const body = await parseBody(request, importRequestSchema);
        return actionResponseSchema.parse({
          data: await actions.importAll(body.days),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/actions/rescan', async () => {
      try {
        return actionResponseSchema.parse({
          data: await actions.rescanAll(),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    })
    .post('/api/actions/rebuild', async () => {
      try {
        return actionResponseSchema.parse({
          data: await actions.rebuildAnalytics(),
        });
      } catch (error) {
        return handleRouteError(error);
      }
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
    )
    .post('/api/settings', async ({ request }) => {
      try {
        const body = await parseBody(request, saveSettingsRequestSchema);
        return actionResponseSchema.parse({
          data: await actions.saveSettings(body),
        });
      } catch (error) {
        return handleRouteError(error);
      }
    });
}
