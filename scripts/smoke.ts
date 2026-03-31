const publicOrigin = Bun.env.GITPULSE_PUBLIC_ORIGIN ?? 'http://127.0.0.1:7467';
const apiBaseUrl = `${publicOrigin}/api`;
const timeoutMs = Number(Bun.env.GITPULSE_SMOKE_TIMEOUT_MS ?? '60000');
const retryDelayMs = 1000;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOk(url: string, label: string): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not started';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(retryDelayMs);
  }

  throw new Error(`${label} did not become ready before timeout: ${lastError}`);
}

const webResponse = await waitForOk(publicOrigin, 'web root');
const webHtml = await webResponse.text();
if (!webHtml.includes('GitPulse vNext bootstrap')) {
  throw new Error('web root did not include the bootstrap marker');
}

const apiResponse = await waitForOk(`${apiBaseUrl}/health`, 'api health');
const apiPayload = await apiResponse.json();
if (apiPayload.status !== 'ok') {
  throw new Error('api health did not report ok status');
}

const dashboardResponse = await waitForOk(
  `${apiBaseUrl}/dashboard`,
  'api dashboard'
);
const dashboardPayload = await dashboardResponse.json();
if (!Array.isArray(dashboardPayload?.data?.summary?.goals)) {
  throw new Error('api dashboard did not return summary goals');
}
if (dashboardPayload.data.summary.goals.length !== 3) {
  throw new Error('api dashboard did not return the default goal set');
}
if (!Array.isArray(dashboardPayload?.data?.repo_cards)) {
  throw new Error('api dashboard did not return repo cards');
}

const repositoriesResponse = await waitForOk(
  `${apiBaseUrl}/repositories`,
  'api repositories'
);
const repositoriesPayload = await repositoriesResponse.json();
if (!Array.isArray(repositoriesPayload?.data?.repositories)) {
  throw new Error('api repositories did not return a repositories collection');
}

const sessionsResponse = await waitForOk(
  `${apiBaseUrl}/sessions`,
  'api sessions'
);
const sessionsPayload = await sessionsResponse.json();
if (!Array.isArray(sessionsPayload?.data?.sessions)) {
  throw new Error('api sessions did not return a sessions collection');
}
if (typeof sessionsPayload?.data?.total_minutes !== 'number') {
  throw new Error('api sessions did not return total minutes');
}

const achievementsResponse = await waitForOk(
  `${apiBaseUrl}/achievements`,
  'api achievements'
);
const achievementsPayload = await achievementsResponse.json();
if (!Array.isArray(achievementsPayload?.data?.achievements)) {
  throw new Error('api achievements did not return an achievements collection');
}
if (typeof achievementsPayload?.data?.today_score !== 'number') {
  throw new Error('api achievements did not return today score');
}

const settingsResponse = await waitForOk(
  `${apiBaseUrl}/settings`,
  'api settings'
);
const settingsPayload = await settingsResponse.json();
if (settingsPayload?.data?.config?.goals?.changed_lines_per_day !== 250) {
  throw new Error('api settings did not return the default goals payload');
}
if (typeof settingsPayload?.data?.paths?.config_file !== 'string') {
  throw new Error('api settings did not return resolved config paths');
}

console.log(`Smoke passed for ${publicOrigin}`);
