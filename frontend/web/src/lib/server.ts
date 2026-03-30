import {
  createGitPulseClient,
  defaultApiBaseUrl,
  GitPulseClientError,
} from "@gitpulse/shared";

export interface BackendStatus {
  title: string;
  message: string;
  baseUrl: string;
  command: string;
  envVar: string;
}

export function apiBaseUrlFromEnv(env: ImportMetaEnv): string {
  return defaultApiBaseUrl(env);
}

export function createServerClient(baseUrl: string) {
  return createGitPulseClient({ baseUrl });
}

export function backendStatusFromError(
  error: unknown,
  apiBaseUrl: string,
): BackendStatus | null {
  if (!(error instanceof GitPulseClientError)) {
    return null;
  }

  if (
    error.options.kind !== "backend_transport" &&
    error.options.kind !== "backend_response"
  ) {
    return null;
  }

  return {
    title:
      error.options.kind === "backend_response"
        ? "GitPulse backend returned an invalid response"
        : "GitPulse backend is unavailable",
    message: error.message,
    baseUrl: error.options.baseUrl || apiBaseUrl,
    command: "go run ./cmd/gitpulse serve",
    envVar: "GITPULSE_API_BASE_URL",
  };
}
