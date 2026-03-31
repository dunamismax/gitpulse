import { z } from 'zod';

const apiEnvSchema = z.object({
  GITPULSE_API_HOST: z.string().default('0.0.0.0'),
  GITPULSE_API_PORT: z.coerce.number().int().positive().default(3001),
  GITPULSE_DATABASE_URL: z.string().min(1),
});

const webEnvSchema = z.object({
  GITPULSE_WEB_HOST: z.string().default('0.0.0.0'),
  GITPULSE_WEB_PORT: z.coerce.number().int().positive().default(4321),
  GITPULSE_PUBLIC_APP_NAME: z.string().default('GitPulse vNext'),
  GITPULSE_PUBLIC_API_BASE_PATH: z.string().default('/api'),
  GITPULSE_PUBLIC_ORIGIN: z.string().url().default('http://127.0.0.1:7467'),
  GITPULSE_INTERNAL_API_ORIGIN: z.string().url().default('http://api:3001'),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

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
