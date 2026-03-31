export const activityLedgerIds = ['working_tree', 'commit', 'push'] as const;

export const rewriteStatus = {
  currentRuntime: 'go-sqlite',
  targetRuntime: 'bun-typescript',
  currentOperatorLoop: ['add', 'import', 'rescan', 'rebuild', 'inspect'],
} as const;

export type ActivityLedgerId = (typeof activityLedgerIds)[number];

export * from './analytics';
export * from './db/activity';
export * from './db/analytics';
export * from './db/migrations';
export * from './db/store';
export * from './db/support';
export * from './db/tracked-repositories';
export * from './domain';
export * from './git';
export * from './sqlite-import';
