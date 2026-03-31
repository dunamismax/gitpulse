import { join } from 'node:path';

import { type ApiEnv, defaultRuntimeConfig } from '@gitpulse-vnext/config';
import {
  authorIdentitySchema,
  githubConfigSchema,
  goalConfigSchema,
  monitoringConfigSchema,
  patternConfigSchema,
  type SettingsView,
  uiConfigSchema,
} from '@gitpulse-vnext/contracts';
import type { PostgresGitPulseStore } from '@gitpulse-vnext/core';

export const defaultSettingsConfig =
  defaultRuntimeConfig satisfies SettingsView['config'];

export function mergeSettings(
  records: Awaited<ReturnType<PostgresGitPulseStore['listSettings']>>,
  env: ApiEnv
): SettingsView {
  const config: SettingsView['config'] = {
    authors: [...defaultSettingsConfig.authors],
    goals: { ...defaultSettingsConfig.goals },
    patterns: {
      include: [...defaultSettingsConfig.patterns.include],
      exclude: [...defaultSettingsConfig.patterns.exclude],
    },
    github: { ...defaultSettingsConfig.github },
    monitoring: { ...defaultSettingsConfig.monitoring },
    ui: { ...defaultSettingsConfig.ui },
  };

  for (const record of records) {
    switch (record.key) {
      case 'authors': {
        const parsed = authorIdentitySchema.array().safeParse(record.valueJson);
        if (parsed.success) {
          config.authors = parsed.data;
        }
        break;
      }
      case 'goals': {
        const parsed = goalConfigSchema.partial().safeParse(record.valueJson);
        if (parsed.success) {
          config.goals = {
            ...config.goals,
            ...parsed.data,
          };
        }
        break;
      }
      case 'patterns': {
        const parsed = patternConfigSchema
          .partial()
          .safeParse(record.valueJson);
        if (parsed.success) {
          config.patterns = {
            ...config.patterns,
            ...parsed.data,
            include: parsed.data.include ?? config.patterns.include,
            exclude: parsed.data.exclude ?? config.patterns.exclude,
          };
        }
        break;
      }
      case 'github': {
        const parsed = githubConfigSchema.partial().safeParse(record.valueJson);
        if (parsed.success) {
          config.github = {
            ...config.github,
            ...parsed.data,
          };
        }
        break;
      }
      case 'monitoring': {
        const parsed = monitoringConfigSchema
          .partial()
          .safeParse(record.valueJson);
        if (parsed.success) {
          config.monitoring = {
            ...config.monitoring,
            ...parsed.data,
          };
        }
        break;
      }
      case 'ui': {
        const parsed = uiConfigSchema.partial().safeParse(record.valueJson);
        if (parsed.success) {
          config.ui = {
            ...config.ui,
            ...parsed.data,
          };
        }
        break;
      }
    }
  }

  return {
    config,
    paths: {
      config_dir: env.GITPULSE_CONFIG_DIR,
      data_dir: env.GITPULSE_DATA_DIR,
      config_file: join(env.GITPULSE_CONFIG_DIR, 'gitpulse.toml'),
    },
  };
}

export async function loadSettingsView(
  store: PostgresGitPulseStore,
  env: ApiEnv
) {
  return mergeSettings(await store.listSettings(), env);
}
