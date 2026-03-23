import Alpine from "alpinejs";

declare global {
  interface Window {
    Alpine: typeof Alpine;
    gitpulse: Record<string, unknown>;
  }
}

type GoalProgress = {
  label: string;
  current: number;
  target: number;
  percent: number;
};

type TodaySummary = {
  live_lines: number;
  staged_lines: number;
  commits_today: number;
  pushes_today: number;
  active_session_minutes: number;
  streak_days: number;
  best_streak_days: number;
  today_score: number;
  goals: GoalProgress[];
};

type TrendPoint = {
  day: string;
  changed_lines: number;
  score: number;
};

type ActivityFeedItem = {
  kind: string;
  repo_name: string;
  timestamp: string;
  detail: string;
};

type DailyRollup = {
  commits: number;
  pushes: number;
  files_touched: number;
  score: number;
};

type RepositoryCard = {
  repo: {
    id: string;
    name: string;
    root_path: string;
    is_monitored: boolean;
  };
  health: string;
  metrics?: DailyRollup | null;
  sparkline: number[];
  snapshot?: {
    branch?: string | null;
    upstream_ref?: string | null;
    live_additions: number;
    live_deletions: number;
    staged_additions: number;
    staged_deletions: number;
  } | null;
};

type DashboardResponse = {
  summary: TodaySummary;
  trend_points: TrendPoint[];
  heatmap_days: TrendPoint[];
  activity_feed: ActivityFeedItem[];
  repo_cards: RepositoryCard[];
};

type LanguageStat = {
  language: string;
  code: number;
};

type CommitEvent = {
  id: string;
  commit_sha: string;
  summary: string;
  additions: number;
  deletions: number;
  authored_at: string;
};

type FocusSession = {
  id: string;
  started_at: string;
  ended_at: string;
  active_minutes: number;
  total_changed_lines: number;
};

type RepoDetailView = {
  card: RepositoryCard;
  include_patterns: string[];
  exclude_patterns: string[];
  recent_commits: CommitEvent[];
  recent_sessions: FocusSession[];
  language_breakdown: LanguageStat[];
  top_files: string[];
};

type SessionSummary = {
  sessions: FocusSession[];
  total_minutes: number;
  average_length_minutes: number;
  longest_session_minutes: number;
};

type Achievement = {
  kind: string;
  reason: string;
  unlocked_at: string;
  day?: string | null;
};

type StreakSummary = {
  current_days: number;
  best_days: number;
};

type AchievementsResponse = {
  achievements: Achievement[];
  streaks: StreakSummary;
  today_score: number;
};

type SettingsResponse = {
  config: {
    authors: Array<{ email: string }>;
    goals: {
      changed_lines_per_day: number;
      commits_per_day: number;
      focus_minutes_per_day: number;
    };
    monitoring: {
      session_gap_minutes: number;
      import_days: number;
    };
    ui: {
      timezone: string;
      day_boundary_minutes: number;
    };
    patterns: {
      include: string[];
      exclude: string[];
    };
    github: {
      enabled: boolean;
      verify_remote_pushes: boolean;
    };
  };
  paths: {
    config_file: string;
    config_dir: string;
    data_dir: string;
  };
};

type SaveSettingsForm = {
  authors: string;
  changed_lines_per_day: number;
  commits_per_day: number;
  focus_minutes_per_day: number;
  timezone: string;
  day_boundary_minutes: number;
  session_gap_minutes: number;
  import_days: number;
  include_patterns: string;
  exclude_patterns: string;
  github_enabled: boolean;
  github_verify_remote_pushes: boolean;
  github_token: string;
};

const defaultSummary = (): TodaySummary => ({
  live_lines: 0,
  staged_lines: 0,
  commits_today: 0,
  pushes_today: 0,
  active_session_minutes: 0,
  streak_days: 0,
  best_streak_days: 0,
  today_score: 0,
  goals: []
});

const defaultSessionSummary = (): SessionSummary => ({
  sessions: [],
  total_minutes: 0,
  average_length_minutes: 0,
  longest_session_minutes: 0
});

const defaultSettingsForm = (): SaveSettingsForm => ({
  authors: "",
  changed_lines_per_day: 0,
  commits_per_day: 0,
  focus_minutes_per_day: 0,
  timezone: "UTC",
  day_boundary_minutes: 0,
  session_gap_minutes: 15,
  import_days: 30,
  include_patterns: "",
  exclude_patterns: "",
  github_enabled: false,
  github_verify_remote_pushes: false,
  github_token: ""
});

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore parse failures and keep the HTTP status text
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went sideways.";
}

function formatTime(value?: string | null): string {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortSha(sha?: string | null): string {
  return sha ? sha.slice(0, 7) : "—";
}

function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function repoIDFromPath(): string {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

function barStyle(score: number): string {
  return `height:${Math.max(score, 4)}px`;
}

function heatmapClass(score: number): string {
  if (score >= 80) return "heat-high";
  if (score >= 40) return "heat-medium";
  if (score > 0) return "heat-low";
  return "heat-empty";
}

function dashboardPage() {
  return {
    loading: true,
    error: "",
    summary: defaultSummary(),
    trendPoints: [] as TrendPoint[],
    heatmapDays: [] as TrendPoint[],
    activityFeed: [] as ActivityFeedItem[],
    repoCards: [] as RepositoryCard[],
    init() {
      void this.load();
      window.setInterval(() => void this.load(true), 5000);
    },
    async load(background = false) {
      if (!background) {
        this.loading = true;
      }
      this.error = "";
      try {
        const data = await fetchJSON<DashboardResponse>("/api/dashboard");
        this.summary = data.summary;
        this.trendPoints = data.trend_points;
        this.heatmapDays = data.heatmap_days;
        this.activityFeed = data.activity_feed;
        this.repoCards = data.repo_cards;
      } catch (error) {
        this.error = errorMessage(error);
      } finally {
        this.loading = false;
      }
    },
    barStyle,
    heatmapClass,
    formatTime,
    async refreshRepo(id: string) {
      await fetchJSON(`/api/repositories/${id}/refresh`, { method: "POST" });
      await this.load(true);
    },
    async toggleRepo(id: string) {
      await fetchJSON(`/api/repositories/${id}/toggle`, { method: "POST" });
      await this.load(true);
    },
    async removeRepo(id: string, name: string) {
      if (!window.confirm(`Remove ${name} from GitPulse tracking?`)) {
        return;
      }
      await fetchJSON(`/api/repositories/${id}/remove`, { method: "POST" });
      await this.load(true);
    }
  };
}

function repositoriesPage() {
  return {
    loading: true,
    error: "",
    message: "",
    path: "",
    cards: [] as RepositoryCard[],
    init() {
      void this.load();
    },
    async load() {
      this.loading = true;
      this.error = "";
      try {
        this.cards = await fetchJSON<RepositoryCard[]>("/api/repositories");
      } catch (error) {
        this.error = errorMessage(error);
      } finally {
        this.loading = false;
      }
    },
    async addTarget() {
      this.error = "";
      this.message = "";
      try {
        await fetchJSON("/api/repositories/add", {
          method: "POST",
          body: JSON.stringify({ path: this.path })
        });
        this.path = "";
        this.message = "Target added.";
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    },
    async refreshRepo(id: string) {
      this.error = "";
      this.message = "";
      try {
        await fetchJSON(`/api/repositories/${id}/refresh`, { method: "POST" });
        this.message = "Repository rescanned.";
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    },
    async toggleRepo(id: string) {
      this.error = "";
      this.message = "";
      try {
        await fetchJSON(`/api/repositories/${id}/toggle`, { method: "POST" });
        this.message = "Monitoring state updated.";
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    },
    async removeRepo(id: string, name: string) {
      if (!window.confirm(`Remove ${name} from GitPulse tracking?`)) {
        return;
      }
      this.error = "";
      this.message = "";
      try {
        await fetchJSON(`/api/repositories/${id}/remove`, { method: "POST" });
        this.message = "Repository removed.";
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    }
  };
}

function repoDetailPage() {
  return {
    loading: true,
    error: "",
    message: "",
    repoID: "",
    includePatterns: "",
    excludePatterns: "",
    view: null as RepoDetailView | null,
    init() {
      this.repoID = repoIDFromPath();
      if (!this.repoID) {
        this.loading = false;
        this.error = "Repository ID missing from route.";
        return;
      }
      void this.load();
    },
    async load() {
      this.loading = true;
      this.error = "";
      try {
        this.view = await fetchJSON<RepoDetailView>(`/api/repositories/${this.repoID}`);
        this.includePatterns = (this.view.include_patterns || []).join("\n");
        this.excludePatterns = (this.view.exclude_patterns || []).join("\n");
      } catch (error) {
        this.error = errorMessage(error);
      } finally {
        this.loading = false;
      }
    },
    async rescan() {
      this.error = "";
      this.message = "";
      try {
        await fetchJSON(`/api/repositories/${this.repoID}/refresh`, { method: "POST" });
        this.message = "Repository rescanned.";
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    },
    async savePatterns() {
      this.error = "";
      this.message = "";
      try {
        await fetchJSON(`/api/repositories/${this.repoID}/patterns`, {
          method: "POST",
          body: JSON.stringify({
            include_patterns: splitLines(this.includePatterns),
            exclude_patterns: splitLines(this.excludePatterns)
          })
        });
        this.message = "Repository patterns saved.";
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    },
    liveLines() {
      return (this.view?.card.snapshot?.live_additions ?? 0) + (this.view?.card.snapshot?.live_deletions ?? 0);
    },
    stagedLines() {
      return (this.view?.card.snapshot?.staged_additions ?? 0) + (this.view?.card.snapshot?.staged_deletions ?? 0);
    },
    formatTime,
    shortSha
  };
}

function sessionsPage() {
  return {
    loading: true,
    error: "",
    summary: defaultSessionSummary(),
    init() {
      void this.load();
    },
    async load() {
      this.loading = true;
      this.error = "";
      try {
        this.summary = await fetchJSON<SessionSummary>("/api/sessions");
      } catch (error) {
        this.error = errorMessage(error);
      } finally {
        this.loading = false;
      }
    },
    formatTime
  };
}

function achievementsPage() {
  return {
    loading: true,
    error: "",
    achievements: [] as Achievement[],
    streaks: { current_days: 0, best_days: 0 } as StreakSummary,
    todayScore: 0,
    init() {
      void this.load();
    },
    async load() {
      this.loading = true;
      this.error = "";
      try {
        const data = await fetchJSON<AchievementsResponse>("/api/achievements");
        this.achievements = data.achievements;
        this.streaks = data.streaks;
        this.todayScore = data.today_score;
      } catch (error) {
        this.error = errorMessage(error);
      } finally {
        this.loading = false;
      }
    }
  };
}

function settingsPage() {
  return {
    loading: true,
    error: "",
    saved: false,
    paths: null as SettingsResponse["paths"] | null,
    form: defaultSettingsForm(),
    init() {
      void this.load();
    },
    async load() {
      this.loading = true;
      this.error = "";
      try {
        const data = await fetchJSON<SettingsResponse>("/api/settings");
        this.paths = data.paths;
        this.form = {
          authors: data.config.authors.map((author) => author.email).join("\n"),
          changed_lines_per_day: data.config.goals.changed_lines_per_day,
          commits_per_day: data.config.goals.commits_per_day,
          focus_minutes_per_day: data.config.goals.focus_minutes_per_day,
          timezone: data.config.ui.timezone,
          day_boundary_minutes: data.config.ui.day_boundary_minutes,
          session_gap_minutes: data.config.monitoring.session_gap_minutes,
          import_days: data.config.monitoring.import_days,
          include_patterns: data.config.patterns.include.join("\n"),
          exclude_patterns: data.config.patterns.exclude.join("\n"),
          github_enabled: data.config.github.enabled,
          github_verify_remote_pushes: data.config.github.verify_remote_pushes,
          github_token: ""
        };
      } catch (error) {
        this.error = errorMessage(error);
      } finally {
        this.loading = false;
      }
    },
    async save() {
      this.error = "";
      this.saved = false;
      try {
        await fetchJSON("/api/settings", {
          method: "POST",
          body: JSON.stringify({
            authors: splitLines(this.form.authors),
            changed_lines_per_day: Number(this.form.changed_lines_per_day),
            commits_per_day: Number(this.form.commits_per_day),
            focus_minutes_per_day: Number(this.form.focus_minutes_per_day),
            timezone: this.form.timezone,
            day_boundary_minutes: Number(this.form.day_boundary_minutes),
            session_gap_minutes: Number(this.form.session_gap_minutes),
            import_days: Number(this.form.import_days),
            include_patterns: splitLines(this.form.include_patterns),
            exclude_patterns: splitLines(this.form.exclude_patterns),
            github_enabled: this.form.github_enabled,
            github_verify_remote_pushes: this.form.github_verify_remote_pushes,
            github_token: this.form.github_token
          })
        });
        this.saved = true;
        await this.load();
      } catch (error) {
        this.error = errorMessage(error);
      }
    }
  };
}

window.gitpulse = {
  dashboardPage,
  repositoriesPage,
  repoDetailPage,
  sessionsPage,
  achievementsPage,
  settingsPage
};

window.Alpine = Alpine;
Alpine.start();
