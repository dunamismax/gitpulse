import type {
  AchievementsView,
  ActionPayload,
  DashboardView,
  RepoCard,
  RepoDetailView,
  SaveSettingsRequest,
  SessionSummary,
  SettingsView,
} from '@gitpulse-vnext/contracts';

function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRepoCard(card: RepoCard): RepoCard {
  return {
    ...card,
    repo: {
      ...card.repo,
      include_patterns: ensureArray(card.repo.include_patterns),
      exclude_patterns: ensureArray(card.repo.exclude_patterns),
    },
    sparkline: ensureArray(card.sparkline),
    snapshot: card.snapshot
      ? {
          ...card.snapshot,
          language_breakdown: ensureArray(card.snapshot.language_breakdown),
        }
      : card.snapshot,
  };
}

export class GitPulseClientError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly kind?:
      | 'backend_unreachable'
      | 'backend_transport'
      | 'backend_response'
      | 'http_error'
  ) {
    super(message);
    this.name = 'GitPulseClientError';
  }
}

export class GitPulseClient {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? '').replace(/\/$/, '');
  }

  async dashboard(): Promise<DashboardView> {
    const raw = await this.get<{ data: DashboardView }>('/api/dashboard');
    const view = raw.data;
    return {
      ...view,
      activity_feed: ensureArray(view.activity_feed),
      trend_points: ensureArray(view.trend_points),
      heatmap_days: ensureArray(view.heatmap_days),
      repo_cards: ensureArray(view.repo_cards).map(normalizeRepoCard),
    };
  }

  async repositories(): Promise<RepoCard[]> {
    const raw = await this.get<{ data: { repositories: RepoCard[] } }>(
      '/api/repositories'
    );
    return ensureArray(raw.data.repositories).map(normalizeRepoCard);
  }

  async repositoryDetail(repoId: string): Promise<RepoDetailView> {
    const raw = await this.get<{ data: RepoDetailView }>(
      `/api/repositories/${repoId}`
    );
    const view = raw.data;
    return {
      ...view,
      card: normalizeRepoCard(view.card),
      include_patterns: ensureArray(view.include_patterns),
      exclude_patterns: ensureArray(view.exclude_patterns),
      recent_commits: ensureArray(view.recent_commits),
      recent_pushes: ensureArray(view.recent_pushes),
      recent_sessions: ensureArray(view.recent_sessions),
      language_breakdown: ensureArray(view.language_breakdown),
      top_files: ensureArray(view.top_files),
    };
  }

  async sessions(): Promise<SessionSummary> {
    const raw = await this.get<{ data: SessionSummary }>('/api/sessions');
    return {
      ...raw.data,
      sessions: ensureArray(raw.data.sessions),
    };
  }

  async achievements(): Promise<AchievementsView> {
    const raw = await this.get<{ data: AchievementsView }>('/api/achievements');
    return {
      ...raw.data,
      achievements: ensureArray(raw.data.achievements),
    };
  }

  async settings(): Promise<SettingsView> {
    const raw = await this.get<{ data: SettingsView }>('/api/settings');
    const view = raw.data;
    return {
      ...view,
      config: {
        ...view.config,
        authors: ensureArray(view.config.authors),
        patterns: {
          include: ensureArray(view.config.patterns.include),
          exclude: ensureArray(view.config.patterns.exclude),
        },
      },
    };
  }

  addTarget(path: string): Promise<ActionPayload> {
    return this.post('/api/repositories/add', { path });
  }

  refreshRepository(repoId: string): Promise<ActionPayload> {
    return this.post(`/api/repositories/${repoId}/refresh`);
  }

  toggleRepository(repoId: string): Promise<ActionPayload> {
    return this.post(`/api/repositories/${repoId}/toggle`);
  }

  removeRepository(repoId: string): Promise<ActionPayload> {
    return this.post(`/api/repositories/${repoId}/remove`);
  }

  saveRepositoryPatterns(
    repoId: string,
    includePatterns: string[],
    excludePatterns: string[]
  ): Promise<ActionPayload> {
    return this.post(`/api/repositories/${repoId}/patterns`, {
      include_patterns: includePatterns,
      exclude_patterns: excludePatterns,
    });
  }

  importRepository(repoId: string, days: number): Promise<ActionPayload> {
    return this.post(`/api/repositories/${repoId}/import`, { days });
  }

  importAll(days: number): Promise<ActionPayload> {
    return this.post('/api/actions/import', { days });
  }

  rescanAll(): Promise<ActionPayload> {
    return this.post('/api/actions/rescan');
  }

  rebuildAnalytics(): Promise<ActionPayload> {
    return this.post('/api/actions/rebuild');
  }

  saveSettings(payload: SaveSettingsRequest): Promise<ActionPayload> {
    return this.post('/api/settings', payload);
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new GitPulseClientError(
        `Could not reach the GitPulse backend at ${this.baseUrl}.`,
        undefined,
        'backend_transport'
      );
    }

    if (!response.ok) {
      let message = `Backend error: ${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (typeof body.error === 'string') {
          message = body.error;
        }
      } catch {
        // keep fallback message
      }
      throw new GitPulseClientError(message, response.status, 'http_error');
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new GitPulseClientError(
        'Backend returned unreadable response.',
        undefined,
        'backend_response'
      );
    }
  }

  private async post(path: string, body?: unknown): Promise<ActionPayload> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitPulseClientError(
        `Could not reach the GitPulse backend at ${this.baseUrl}.`,
        undefined,
        'backend_transport'
      );
    }

    if (!response.ok) {
      let message = `Backend error: ${response.status} ${response.statusText}`;
      try {
        const parsed = (await response.json()) as { error?: string };
        if (typeof parsed.error === 'string') {
          message = parsed.error;
        }
      } catch {
        // keep fallback message
      }
      throw new GitPulseClientError(message, response.status, 'http_error');
    }

    try {
      const envelope = (await response.json()) as { data: ActionPayload };
      const payload = envelope.data;
      return {
        ...payload,
        result: {
          ...payload.result,
          lines: ensureArray(payload.result.lines),
          warnings: ensureArray(payload.result.warnings),
        },
      };
    } catch {
      throw new GitPulseClientError(
        'Backend returned unreadable response.',
        undefined,
        'backend_response'
      );
    }
  }
}

export function createClient(baseUrl?: string): GitPulseClient {
  return new GitPulseClient(baseUrl);
}
