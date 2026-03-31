import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyGitPulseEnvOverrides,
  databaseHostFromUrl,
  defaultRuntimeConfig,
  loadRuntimeConfig,
  parseApiEnv,
  parseWebEnv,
  runtimeConfigToSettingsRecords,
} from '../src/index';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

describe('config parsing', () => {
  test('applies API defaults', () => {
    const env = parseApiEnv({});

    expect(env.GITPULSE_API_HOST).toBe('0.0.0.0');
    expect(env.GITPULSE_API_PORT).toBe(3001);
    expect(env.GITPULSE_DATABASE_URL).toBe(
      'postgres://gitpulse:gitpulse@127.0.0.1:5432/gitpulse'
    );
    expect(env.GITPULSE_CONFIG_DIR).toBe('/var/lib/gitpulse/config');
    expect(env.GITPULSE_DATA_DIR).toBe('/var/lib/gitpulse/data');
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

  test('applies nested env overrides onto runtime config defaults', () => {
    const config = applyGitPulseEnvOverrides(defaultRuntimeConfig, {
      GITPULSE_UI__TIMEZONE: 'America/New_York',
      GITPULSE_MONITORING__SESSION_GAP_MINUTES: '45',
      GITPULSE_GITHUB__VERIFY_REMOTE_PUSHES: 'true',
      GITPULSE_PATTERNS__INCLUDE: '["apps/**","packages/**"]',
    });

    expect(config.ui.timezone).toBe('America/New_York');
    expect(config.monitoring.session_gap_minutes).toBe(45);
    expect(config.github.verify_remote_pushes).toBe(true);
    expect(config.patterns.include).toEqual(['apps/**', 'packages/**']);
  });

  test('loads TOML config and converts persisted setting records', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'gitpulse-config-test-'));
    tempDirs.push(tempDir);

    const configFile = join(tempDir, 'gitpulse.toml');
    await writeFile(
      configFile,
      `
[goals]
changed_lines_per_day = 400
commits_per_day = 4
focus_minutes_per_day = 120

[monitoring]
import_days = 3650
session_gap_minutes = 20
repo_discovery_depth = 6

[ui]
timezone = "UTC"
day_boundary_minutes = 0

[patterns]
include = ["apps/**"]
exclude = ["dist/**"]

[github]
enabled = true
verify_remote_pushes = true
token = "secret"
`
    );

    const config = await loadRuntimeConfig(configFile, {
      GITPULSE_UI__TIMEZONE: 'America/Los_Angeles',
    });
    const settingRecords = runtimeConfigToSettingsRecords(config);

    expect(config.goals.changed_lines_per_day).toBe(400);
    expect(config.monitoring.import_days).toBe(3650);
    expect(config.ui.timezone).toBe('America/Los_Angeles');
    expect(settingRecords.map((record) => record.key)).toEqual([
      'authors',
      'goals',
      'patterns',
      'github',
      'monitoring',
      'ui',
    ]);
    expect(
      settingRecords.find((record) => record.key === 'github')?.valueJson
    ).toEqual({
      enabled: true,
      token: 'secret',
      verify_remote_pushes: true,
    });
  });
});
