export const activityLedgerIds = ['working_tree', 'commit', 'push'] as const;

export const rewriteStatus = {
  currentRuntime: 'go-sqlite',
  targetRuntime: 'bun-typescript',
  currentOperatorLoop: ['add', 'import', 'rescan', 'rebuild', 'inspect'],
} as const;

export type ActivityLedgerId = (typeof activityLedgerIds)[number];
