import { z } from 'zod';

export const primarySurfaceIds = [
  'dashboard',
  'repositories',
  'repository-detail',
  'sessions',
  'achievements',
  'settings',
] as const;

export const manualActionIds = [
  'add_target',
  'import_all',
  'rescan_all',
  'rebuild_analytics',
  'refresh_repo',
  'toggle_repo',
  'remove_repo',
  'save_repo_patterns',
  'import_repo',
  'save_settings',
] as const;

export const primarySurfaceSchema = z.enum(primarySurfaceIds);
export const manualActionSchema = z.enum(manualActionIds);

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('gitpulse-vnext-api'),
  ledgers: z.array(z.enum(['working_tree', 'commit', 'push'])).length(3),
  surfaces: z.array(primarySurfaceSchema).length(6),
  manualActions: z.array(manualActionSchema).length(10),
  databaseHost: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
