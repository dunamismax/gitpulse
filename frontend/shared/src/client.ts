import {
  normalizeAchievementsView,
  normalizeActionPayload,
  normalizeDashboardView,
  normalizeRepoDetailView,
  normalizeRepositoriesPayload,
  normalizeSessionSummary,
  normalizeSettingsView,
} from "./domain";
import type {
  AchievementsView,
  ActionPayload,
  DashboardView,
  DataEnvelope,
  ErrorResponse,
  RepoCard,
  RepoDetailView,
  RepositoriesPayload,
  SaveSettingsRequest,
  SessionSummary,
  SettingsView,
} from "./types";

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GitPulseClientOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
}

export class GitPulseClientError extends Error {
  constructor(
    message: string,
    readonly options: {
      statusCode?: number;
      kind?:
        | "backend_unreachable"
        | "backend_timeout"
        | "backend_transport"
        | "backend_response"
        | "http_error";
      baseUrl?: string;
    } = {},
  ) {
    super(message);
    this.name = "GitPulseClientError";
  }
}

export class GitPulseClient {
  readonly baseUrl: string;
  readonly #fetcher: Fetcher;

  constructor(options: GitPulseClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultApiBaseUrl());
    this.#fetcher = options.fetcher ?? fetch;
  }

  dashboard(): Promise<DashboardView> {
    return this.#getData<DashboardView>("/api/dashboard").then(
      normalizeDashboardView,
    );
  }

  repositories(): Promise<RepoCard[]> {
    return this.#getData<RepositoriesPayload>("/api/repositories")
      .then(normalizeRepositoriesPayload)
      .then((payload) => payload.repositories);
  }

  repositoryDetail(repoId: string): Promise<RepoDetailView> {
    return this.#getData<RepoDetailView>(`/api/repositories/${repoId}`).then(
      normalizeRepoDetailView,
    );
  }

  sessions(): Promise<SessionSummary> {
    return this.#getData<SessionSummary>("/api/sessions").then(
      normalizeSessionSummary,
    );
  }

  achievements(): Promise<AchievementsView> {
    return this.#getData<AchievementsView>("/api/achievements").then(
      normalizeAchievementsView,
    );
  }

  settings(): Promise<SettingsView> {
    return this.#getData<SettingsView>("/api/settings").then(
      normalizeSettingsView,
    );
  }

  addTarget(path: string): Promise<ActionPayload> {
    return this.#postData<ActionPayload>("/api/repositories/add", {
      path,
    }).then(normalizeActionPayload);
  }

  refreshRepository(repoId: string): Promise<ActionPayload> {
    return this.#postData<ActionPayload>(
      `/api/repositories/${repoId}/refresh`,
    ).then(normalizeActionPayload);
  }

  toggleRepository(repoId: string): Promise<ActionPayload> {
    return this.#postData<ActionPayload>(
      `/api/repositories/${repoId}/toggle`,
    ).then(normalizeActionPayload);
  }

  removeRepository(repoId: string): Promise<ActionPayload> {
    return this.#postData<ActionPayload>(
      `/api/repositories/${repoId}/remove`,
    ).then(normalizeActionPayload);
  }

  saveRepositoryPatterns(
    repoId: string,
    includePatterns: string[],
    excludePatterns: string[],
  ): Promise<ActionPayload> {
    return this.#postData<ActionPayload>(
      `/api/repositories/${repoId}/patterns`,
      {
        include_patterns: includePatterns,
        exclude_patterns: excludePatterns,
      },
    ).then(normalizeActionPayload);
  }

  importRepository(repoId: string, days: number): Promise<ActionPayload> {
    return this.#postData<ActionPayload>(`/api/repositories/${repoId}/import`, {
      days,
    }).then(normalizeActionPayload);
  }

  importAll(days: number): Promise<ActionPayload> {
    return this.#postData<ActionPayload>("/api/actions/import", { days }).then(
      normalizeActionPayload,
    );
  }

  rescanAll(): Promise<ActionPayload> {
    return this.#postData<ActionPayload>("/api/actions/rescan").then(
      normalizeActionPayload,
    );
  }

  rebuildAnalytics(): Promise<ActionPayload> {
    return this.#postData<ActionPayload>("/api/actions/rebuild").then(
      normalizeActionPayload,
    );
  }

  saveSettings(payload: SaveSettingsRequest): Promise<ActionPayload> {
    return this.#postData<ActionPayload>("/api/settings", payload).then(
      normalizeActionPayload,
    );
  }

  async #getData<T>(path: string): Promise<T> {
    const payload = await this.#request<DataEnvelope<T>>(path, {
      method: "GET",
    });
    return unwrapData(payload);
  }

  async #postData<T>(path: string, body?: unknown): Promise<T> {
    const payload = await this.#request<DataEnvelope<T>>(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return unwrapData(payload);
  }

  async #request<T>(path: string, init: RequestInit): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`).toString();

    let response: Response;
    try {
      response = await this.#fetcher(url, init);
    } catch (_error) {
      const message = buildTransportMessage(
        this.baseUrl,
        "Could not reach the GitPulse backend.",
      );
      throw new GitPulseClientError(message, {
        kind: "backend_transport",
        baseUrl: this.baseUrl,
      });
    }

    if (!response.ok) {
      let message = `GitPulse backend error: ${response.status} ${response.statusText}`;
      try {
        const payload = (await response.json()) as ErrorResponse;
        if (typeof payload.error === "string") {
          message = payload.error;
        }
      } catch {
        // keep the fallback message
      }

      throw new GitPulseClientError(message, {
        statusCode: response.status,
        kind: "http_error",
        baseUrl: this.baseUrl,
      });
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new GitPulseClientError(
        `GitPulse backend returned an unreadable response. Expected JSON from ${this.baseUrl}.`,
        {
          kind: "backend_response",
          baseUrl: this.baseUrl,
        },
      );
    }
  }
}

export function createGitPulseClient(
  options: GitPulseClientOptions = {},
): GitPulseClient {
  return new GitPulseClient(options);
}

export function unwrapData<T>(payload: DataEnvelope<T>): T {
  return payload.data;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function defaultApiBaseUrl(env?: {
  GITPULSE_API_BASE_URL?: string | undefined;
}): string {
  const configured = env?.GITPULSE_API_BASE_URL?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://127.0.0.1:7467";
}

export function buildTransportMessage(baseUrl: string, prefix: string): string {
  return `${prefix} GitPulse frontend is configured to call ${baseUrl}. Start the Go server with \`go run ./cmd/gitpulse serve\`, or set \`GITPULSE_API_BASE_URL\` to the correct origin.`;
}
