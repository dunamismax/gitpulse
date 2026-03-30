import type {
  AchievementsView,
  ActionPayload,
  DashboardView,
  LanguageStat,
  RepoCard,
  RepoDetailView,
  RepositoriesPayload,
  Repository,
  SessionSummary,
  SettingsView,
} from "./types";

export function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeRepository(repository: Repository): Repository {
  return {
    ...repository,
    include_patterns: ensureArray(repository.include_patterns),
    exclude_patterns: ensureArray(repository.exclude_patterns),
  };
}

export function normalizeLanguages(
  languages: LanguageStat[] | null | undefined,
): LanguageStat[] {
  return ensureArray(languages);
}

export function normalizeRepoCard(card: RepoCard): RepoCard {
  return {
    ...card,
    repo: normalizeRepository(card.repo),
    sparkline: ensureArray(card.sparkline),
    snapshot: card.snapshot
      ? {
          ...card.snapshot,
          language_breakdown: normalizeLanguages(
            card.snapshot.language_breakdown,
          ),
        }
      : card.snapshot,
  };
}

export function normalizeDashboardView(view: DashboardView): DashboardView {
  return {
    ...view,
    activity_feed: ensureArray(view.activity_feed),
    trend_points: ensureArray(view.trend_points),
    heatmap_days: ensureArray(view.heatmap_days),
    repo_cards: ensureArray(view.repo_cards).map(normalizeRepoCard),
  };
}

export function normalizeRepositoriesPayload(
  payload: RepositoriesPayload,
): RepositoriesPayload {
  return {
    repositories: ensureArray(payload.repositories).map(normalizeRepoCard),
  };
}

export function normalizeRepoDetailView(view: RepoDetailView): RepoDetailView {
  return {
    ...view,
    card: normalizeRepoCard(view.card),
    include_patterns: ensureArray(view.include_patterns),
    exclude_patterns: ensureArray(view.exclude_patterns),
    recent_commits: ensureArray(view.recent_commits),
    recent_pushes: ensureArray(view.recent_pushes),
    recent_sessions: ensureArray(view.recent_sessions),
    language_breakdown: normalizeLanguages(view.language_breakdown),
    top_files: ensureArray(view.top_files),
  };
}

export function normalizeSessionSummary(
  summary: SessionSummary,
): SessionSummary {
  return {
    ...summary,
    sessions: ensureArray(summary.sessions),
  };
}

export function normalizeAchievementsView(
  view: AchievementsView,
): AchievementsView {
  return {
    ...view,
    achievements: ensureArray(view.achievements),
  };
}

export function normalizeSettingsView(view: SettingsView): SettingsView {
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

export function normalizeActionPayload(payload: ActionPayload): ActionPayload {
  return {
    ...payload,
    result: {
      ...payload.result,
      lines: ensureArray(payload.result.lines),
      warnings: ensureArray(payload.result.warnings),
    },
    repositories: payload.repositories
      ? ensureArray(payload.repositories).map(normalizeRepository)
      : payload.repositories,
    repository: payload.repository
      ? normalizeRepository(payload.repository)
      : payload.repository,
    repository_card: payload.repository_card
      ? normalizeRepoCard(payload.repository_card)
      : payload.repository_card,
    settings: payload.settings
      ? normalizeSettingsView(payload.settings)
      : payload.settings,
  };
}
