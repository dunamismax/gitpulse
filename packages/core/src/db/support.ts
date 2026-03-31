import postgres from 'postgres';

export type PostgresClient = postgres.Sql;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function createPostgresClient(
  connectionString: string,
  options: postgres.Options<Record<string, never>> = {}
): PostgresClient {
  return postgres(connectionString, {
    idle_timeout: 5,
    max: 1,
    prepare: false,
    ...options,
  });
}

export async function closePostgresClient(sql: PostgresClient) {
  await sql.end({ timeout: 5 });
}

export function assertLimit(limit: number, fieldName = 'limit'): number {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return limit;
}

export function normalizeUuid(value: string, fieldName: string): string {
  if (!uuidPattern.test(value)) {
    throw new Error(`${fieldName} must be a UUID`);
  }

  return value.toLowerCase();
}

export function normalizeTimestamp(
  value: Date | string,
  fieldName = 'timestamp'
): Date {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid timestamp`);
  }

  return new Date(date.toISOString());
}

export function normalizeNullableTimestamp(
  value: Date | string | null | undefined,
  fieldName = 'timestamp'
): Date | null {
  if (value == null) {
    return null;
  }

  return normalizeTimestamp(value, fieldName);
}

export function normalizeDate(value: Date | string, fieldName = 'day'): string {
  if (typeof value === 'string' && datePattern.test(value)) {
    return value;
  }

  return normalizeTimestamp(value, fieldName).toISOString().slice(0, 10);
}

export function normalizeNullableDate(
  value: Date | string | null | undefined,
  fieldName = 'day'
): string | null {
  if (value == null) {
    return null;
  }

  return normalizeDate(value, fieldName);
}

export function normalizeEnumLike<const T extends readonly string[]>(
  value: string,
  allowedValues: T,
  fieldName: string
): T[number] {
  if (!allowedValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }

  return value as T[number];
}

export function normalizeJsonArray<T>(
  value: T[] | string | null | undefined,
  fieldName: string
): T[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON array`);
  }

  return parsed as T[];
}

export function normalizeBoolean(
  value: boolean | number | string,
  fieldName: string
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }

  throw new Error(`${fieldName} must be boolean-like`);
}

export function normalizeNumber(
  value: number | string,
  fieldName: string
): number {
  const normalized = typeof value === 'string' ? Number(value) : value;

  if (!Number.isFinite(normalized)) {
    throw new Error(`${fieldName} must be finite`);
  }

  return normalized;
}

export function jsonb(sql: Pick<PostgresClient, 'json'>, value: unknown) {
  return sql.json(value as Parameters<PostgresClient['json']>[0]);
}
