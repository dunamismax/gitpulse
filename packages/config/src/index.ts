import { readFile } from 'node:fs/promises';

import {
  type RuntimeConfig,
  runtimeConfigSchema,
} from '@gitpulse-vnext/contracts';
import { z } from 'zod';

const apiEnvSchema = z.object({
  GITPULSE_API_HOST: z.string().default('0.0.0.0'),
  GITPULSE_API_PORT: z.coerce.number().int().positive().default(3001),
  GITPULSE_DATABASE_URL: z.string().min(1),
  GITPULSE_CONFIG_DIR: z.string().default('/var/lib/gitpulse/config'),
  GITPULSE_DATA_DIR: z.string().default('/var/lib/gitpulse/data'),
});

const webEnvSchema = z.object({
  GITPULSE_WEB_HOST: z.string().default('0.0.0.0'),
  GITPULSE_WEB_PORT: z.coerce.number().int().positive().default(4321),
  GITPULSE_PUBLIC_APP_NAME: z.string().default('GitPulse vNext'),
  GITPULSE_PUBLIC_API_BASE_PATH: z.string().default('/api'),
  GITPULSE_PUBLIC_ORIGIN: z.string().url().default('http://127.0.0.1:7467'),
  GITPULSE_INTERNAL_API_ORIGIN: z.string().url().default('http://api:3001'),
});

const persistedSettingKeys = [
  'authors',
  'goals',
  'patterns',
  'github',
  'monitoring',
  'ui',
] as const;

const defaultExcludePatterns = [
  '.git/**',
  'target/**',
  'node_modules/**',
  'build/**',
  'dist/**',
  '.next/**',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'go.sum',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.webp',
  '*.mp4',
  '*.mov',
  '*.avi',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.bz2',
  '*.7z',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.wasm',
] as const;

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;
export type PersistedSettingKey = (typeof persistedSettingKeys)[number];
export type PersistedSettingRecord = {
  key: PersistedSettingKey;
  valueJson: RuntimeConfig[PersistedSettingKey];
};

export const defaultRuntimeConfig = runtimeConfigSchema.parse({
  authors: [],
  goals: {
    changed_lines_per_day: 250,
    commits_per_day: 3,
    focus_minutes_per_day: 90,
  },
  patterns: {
    include: [],
    exclude: [...defaultExcludePatterns],
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
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) {
    return structuredClone(base);
  }

  if (Array.isArray(base)) {
    return (
      Array.isArray(override)
        ? structuredClone(override)
        : structuredClone(base)
    ) as T;
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

    for (const key of keys) {
      const baseValue = (base as Record<string, unknown>)[key];
      const overrideValue = override[key];

      if (overrideValue === undefined) {
        merged[key] = structuredClone(baseValue);
        continue;
      }

      if (baseValue === undefined) {
        merged[key] = structuredClone(overrideValue);
        continue;
      }

      merged[key] = deepMerge(baseValue, overrideValue);
    }

    return merged as T;
  }

  return structuredClone(override as T);
}

function getNestedValue(
  value: Record<string, unknown>,
  pathSegments: readonly string[]
): unknown {
  let current: unknown = value;

  for (const segment of pathSegments) {
    if (!isPlainObject(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function setNestedValue(
  target: Record<string, unknown>,
  pathSegments: readonly string[],
  value: unknown
) {
  let current = target;

  for (const segment of pathSegments.slice(0, -1)) {
    const next = current[segment];
    if (!isPlainObject(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const leaf = pathSegments[pathSegments.length - 1];
  if (!leaf) {
    throw new Error('environment override path cannot be empty');
  }

  current[leaf] = value;
}

function coerceEnvValue(raw: string, currentValue: unknown): unknown {
  const trimmed = raw.trim();

  if (Array.isArray(currentValue)) {
    if (!trimmed) {
      return [];
    }

    if (!trimmed.startsWith('[')) {
      return trimmed
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }

    return JSON.parse(trimmed) as unknown;
  }

  if (isPlainObject(currentValue)) {
    return JSON.parse(trimmed) as unknown;
  }

  if (typeof currentValue === 'boolean') {
    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }
  }

  if (typeof currentValue === 'number') {
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return JSON.parse(trimmed) as unknown;
  }

  return raw;
}

export function parseApiEnv(env: Record<string, string | undefined>): ApiEnv {
  return apiEnvSchema.parse({
    GITPULSE_DATABASE_URL:
      'postgres://gitpulse:gitpulse@127.0.0.1:5432/gitpulse',
    ...env,
  });
}

export function parseWebEnv(env: Record<string, string | undefined>): WebEnv {
  return webEnvSchema.parse(env);
}

export function databaseHostFromUrl(databaseUrl: string): string {
  return new URL(databaseUrl).hostname;
}

export function applyGitPulseEnvOverrides(
  config: RuntimeConfig,
  env: Record<string, string | undefined>
): RuntimeConfig {
  const overrides: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(env)) {
    if (!rawValue || !key.startsWith('GITPULSE_') || !key.includes('__')) {
      continue;
    }

    const pathSegments = key
      .replace(/^GITPULSE_/, '')
      .split('__')
      .map((segment) => segment.trim().toLowerCase())
      .filter((segment) => segment.length > 0);

    if (pathSegments.length === 0) {
      continue;
    }

    const currentValue = getNestedValue(
      config as unknown as Record<string, unknown>,
      pathSegments
    );

    setNestedValue(
      overrides,
      pathSegments,
      coerceEnvValue(rawValue, currentValue)
    );
  }

  return runtimeConfigSchema.parse(deepMerge(config, overrides));
}

export async function loadRuntimeConfig(
  configFile: string,
  env: Record<string, string | undefined>
): Promise<RuntimeConfig> {
  let fileConfig: unknown = {};

  if (configFile.trim().length > 0) {
    try {
      const raw = await readFile(configFile, 'utf8');
      fileConfig = Bun.TOML.parse(raw) as unknown;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }
  }

  const merged = runtimeConfigSchema.parse(
    deepMerge(defaultRuntimeConfig, fileConfig)
  );

  return applyGitPulseEnvOverrides(merged, env);
}

export function runtimeConfigToSettingsRecords(
  config: RuntimeConfig
): PersistedSettingRecord[] {
  return persistedSettingKeys.map((key) => ({
    key,
    valueJson: structuredClone(config[key]),
  }));
}
