import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applySqlMigrations } from '../packages/core/src/index';

const defaultDatabaseUrl =
  'postgres://gitpulse:gitpulse@127.0.0.1:5432/gitpulse';
const migrationRetryCount = Number(
  Bun.env.GITPULSE_MIGRATION_RETRY_COUNT ?? '30'
);
const migrationRetryDelayMs = Number(
  Bun.env.GITPULSE_MIGRATION_RETRY_DELAY_MS ?? '1000'
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(scriptDir, '..', 'db', 'migrations');

await applySqlMigrations({
  connectionString: Bun.env.GITPULSE_DATABASE_URL ?? defaultDatabaseUrl,
  migrationsDir,
  retryCount: migrationRetryCount,
  retryDelayMs: migrationRetryDelayMs,
});
