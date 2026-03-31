import { expect, test } from 'bun:test';

import { createApp } from '../src/app';

test('GET /api/health returns the bootstrap contract', async () => {
  const app = createApp({
    GITPULSE_API_HOST: '127.0.0.1',
    GITPULSE_API_PORT: 3001,
    GITPULSE_DATABASE_URL:
      'postgres://gitpulse:gitpulse@postgres:5432/gitpulse',
  });

  const response = await app.handle(
    new Request('http://gitpulse.local/api/health')
  );
  const payload = await response.json();

  expect(response.status).toBe(200);
  expect(payload.status).toBe('ok');
  expect(payload.databaseHost).toBe('postgres');
  expect(payload.manualActions).toContain('rebuild_analytics');
});
