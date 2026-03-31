import { describe, expect, test } from 'bun:test';

import { databaseHostFromUrl, parseApiEnv, parseWebEnv } from '../src/index';

describe('config parsing', () => {
  test('applies API defaults', () => {
    const env = parseApiEnv({});

    expect(env.GITPULSE_API_HOST).toBe('0.0.0.0');
    expect(env.GITPULSE_API_PORT).toBe(3001);
    expect(env.GITPULSE_DATABASE_URL).toBe(
      'postgres://gitpulse:gitpulse@127.0.0.1:5432/gitpulse'
    );
  });

  test('applies web defaults', () => {
    const env = parseWebEnv({});

    expect(env.GITPULSE_WEB_PORT).toBe(4321);
    expect(env.GITPULSE_PUBLIC_API_BASE_PATH).toBe('/api');
    expect(env.GITPULSE_PUBLIC_ORIGIN).toBe('http://127.0.0.1:7467');
  });

  test('extracts the database host', () => {
    expect(
      databaseHostFromUrl('postgres://gitpulse:gitpulse@postgres:5432/gitpulse')
    ).toBe('postgres');
  });
});
