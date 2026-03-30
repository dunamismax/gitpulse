import {
  createGitPulseClient,
  defaultApiBaseUrl,
  GitPulseClientError,
  type SurfaceKey,
  tuiScreens,
} from "@gitpulse/shared";

import { renderFoundationShell } from "./render";

const apiBaseUrl = defaultApiBaseUrl({
  GITPULSE_API_BASE_URL: process.env.GITPULSE_API_BASE_URL,
});
const client = createGitPulseClient({ baseUrl: apiBaseUrl });
const screens = Object.values(tuiScreens) as (typeof tuiScreens)[SurfaceKey][];

async function main(): Promise<void> {
  try {
    const dashboard = await client.dashboard();
    console.log(renderFoundationShell(dashboard, screens, apiBaseUrl));
  } catch (error) {
    if (error instanceof GitPulseClientError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

await main();
