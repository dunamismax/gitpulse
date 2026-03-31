import { type ApiEnv, databaseHostFromUrl } from '@gitpulse-vnext/config';
import {
  healthResponseSchema,
  manualActionIds,
  primarySurfaceIds,
} from '@gitpulse-vnext/contracts';
import { activityLedgerIds } from '@gitpulse-vnext/core';
import { Elysia } from 'elysia';

export function createApp(env: ApiEnv) {
  return new Elysia().get('/api/health', () =>
    healthResponseSchema.parse({
      status: 'ok',
      service: 'gitpulse-vnext-api',
      ledgers: [...activityLedgerIds],
      surfaces: [...primarySurfaceIds],
      manualActions: [...manualActionIds],
      databaseHost: databaseHostFromUrl(env.GITPULSE_DATABASE_URL),
    })
  );
}
