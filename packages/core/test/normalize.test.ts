import { describe, expect, test } from 'bun:test';

import {
  normalizeDate,
  normalizeEnumLike,
  normalizeJsonArray,
  normalizeTimestamp,
} from '../src/db/support';
import { activityKinds, repositoryStates } from '../src/domain';

describe('postgres normalization helpers', () => {
  test('normalizes timestamps to UTC dates', () => {
    const value = normalizeTimestamp('2026-03-30T21:45:00-04:00');

    expect(value.toISOString()).toBe('2026-03-31T01:45:00.000Z');
  });

  test('normalizes date-only values', () => {
    expect(normalizeDate('2026-03-31')).toBe('2026-03-31');
    expect(normalizeDate('2026-03-31T14:25:00Z')).toBe('2026-03-31');
  });

  test('parses JSON arrays for persisted jsonb payloads', () => {
    expect(
      normalizeJsonArray<string>('["src/**","docs/**"]', 'patterns')
    ).toEqual(['src/**', 'docs/**']);
  });

  test('rejects unknown enum-like values', () => {
    expect(() =>
      normalizeEnumLike('broken', repositoryStates, 'repository.state')
    ).toThrow(/repository.state/);
  });

  test('accepts known enum-like values', () => {
    expect(
      normalizeEnumLike('manual_rescan', activityKinds, 'event.kind')
    ).toBe('manual_rescan');
  });
});
