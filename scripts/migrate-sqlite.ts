import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRuntimeConfig,
  parseApiEnv,
  runtimeConfigToSettingsRecords,
} from '../packages/config/src/index';
import {
  applySqlMigrations,
  closePostgresClient,
  createPostgresClient,
  createPostgresGitPulseStore,
  importSqliteDatabase,
} from '../packages/core/src/index';

interface CliOptions {
  sqlitePath: string;
  configFile: string;
  databaseUrl: string;
}

function usage() {
  return [
    'Usage: bun run scripts/migrate-sqlite.ts --sqlite /path/to/gitpulse.db --config /path/to/gitpulse.toml [--database-url postgres://...]',
    '',
    'Environment fallbacks:',
    '- GITPULSE_LEGACY_SQLITE_PATH',
    '- GITPULSE_LEGACY_CONFIG_FILE',
    '- GITPULSE_DATABASE_URL',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const apiEnv = parseApiEnv(Bun.env);
  let sqlitePath = Bun.env.GITPULSE_LEGACY_SQLITE_PATH ?? '';
  let configFile = Bun.env.GITPULSE_LEGACY_CONFIG_FILE ?? '';
  let databaseUrl = apiEnv.GITPULSE_DATABASE_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    const next = argv[index + 1];
    if (!next) {
      throw new Error(`missing value for ${arg}`);
    }

    switch (arg) {
      case '--sqlite':
        sqlitePath = next;
        index += 1;
        break;
      case '--config':
        configFile = next;
        index += 1;
        break;
      case '--database-url':
        databaseUrl = next;
        index += 1;
        break;
      default:
        throw new Error(`unknown argument ${arg}`);
    }
  }

  if (!sqlitePath.trim() || !configFile.trim()) {
    throw new Error(usage());
  }

  return {
    sqlitePath: resolve(sqlitePath),
    configFile: resolve(configFile),
    databaseUrl,
  };
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(scriptDir, '..', 'db', 'migrations');
const options = parseArgs(process.argv.slice(2));
const runtimeConfig = await loadRuntimeConfig(options.configFile, Bun.env);

await applySqlMigrations({
  connectionString: options.databaseUrl,
  migrationsDir,
  retryCount: Number(Bun.env.GITPULSE_MIGRATION_RETRY_COUNT ?? '30'),
  retryDelayMs: Number(Bun.env.GITPULSE_MIGRATION_RETRY_DELAY_MS ?? '1000'),
});

const sql = createPostgresClient(options.databaseUrl);
const store = createPostgresGitPulseStore(sql);

try {
  const report = await importSqliteDatabase({
    sqlitePath: options.sqlitePath,
    store,
    settingsRecords: runtimeConfigToSettingsRecords(runtimeConfig),
    rebuildOptions: {
      sessionGapMinutes: runtimeConfig.monitoring.session_gap_minutes,
      timezone: runtimeConfig.ui.timezone,
      dayBoundaryMinutes: runtimeConfig.ui.day_boundary_minutes,
    },
  });

  console.log('SQLite import complete');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closePostgresClient(sql);
}
