import { parseApiEnv } from '@gitpulse-vnext/config';

import { createApp } from './app';

const env = parseApiEnv(Bun.env);
const app = createApp(env);

if (import.meta.main) {
  app.listen({ hostname: env.GITPULSE_API_HOST, port: env.GITPULSE_API_PORT });
  console.log(
    `gitpulse-vnext api listening on http://${env.GITPULSE_API_HOST}:${env.GITPULSE_API_PORT}`
  );
}

export type App = typeof app;
export { app };
