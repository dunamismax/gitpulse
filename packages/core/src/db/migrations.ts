import { readdir, readFile } from 'node:fs/promises';

import {
  closePostgresClient,
  createPostgresClient,
  type PostgresClient,
} from './support';

export interface ApplySqlMigrationsOptions {
  connectionString: string;
  migrationsDir: string;
  retryCount?: number;
  retryDelayMs?: number;
  logger?: Pick<Console, 'log'>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectPostgresWithRetry(
  connectionString: string,
  {
    retryCount = 30,
    retryDelayMs = 1000,
    logger = console,
  }: Omit<ApplySqlMigrationsOptions, 'connectionString' | 'migrationsDir'> = {}
): Promise<PostgresClient> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    const sql = createPostgresClient(connectionString);

    try {
      await sql`select 1`;
      return sql;
    } catch (error) {
      lastError = error;
      await closePostgresClient(sql).catch(() => undefined);

      if (attempt < retryCount) {
        logger.log(
          `postgres not ready yet (${attempt}/${retryCount}); retrying in ${retryDelayMs}ms`
        );
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('postgres did not become ready for migrations');
}

export async function applySqlMigrationsWithClient(
  sql: PostgresClient,
  migrationsDir: string,
  logger: Pick<Console, 'log'> = console
) {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error(`no SQL migrations found in ${migrationsDir}`);
  }

  for (const migrationFile of migrationFiles) {
    const migrationSql = await readFile(
      `${migrationsDir}/${migrationFile}`,
      'utf8'
    );

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);
    });

    logger.log(`applied migration ${migrationFile}`);
  }
}

export async function applySqlMigrations(options: ApplySqlMigrationsOptions) {
  const sql = await connectPostgresWithRetry(options.connectionString, options);

  try {
    await applySqlMigrationsWithClient(
      sql,
      options.migrationsDir,
      options.logger ?? console
    );
  } finally {
    await closePostgresClient(sql);
  }
}
