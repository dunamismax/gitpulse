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

console.log(`Smoke passed for ${publicOrigin}`);
