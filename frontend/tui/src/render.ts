import {
  type AchievementsView,
  type DashboardView,
  formatDateTime,
  formatMinutes,
  pushKindLabel,
  type RepoCard,
  type RepoDetailView,
  type SessionSummary,
  type SettingsView,
  type SurfaceKey,
  shortSha,
  sumLines,
  tuiScreens,
} from "@gitpulse/shared";

export interface RenderData {
  achievements?: AchievementsView;
  dashboard?: DashboardView;
  repoDetail?: RepoDetailView;
  repositories?: RepoCard[];
  sessions?: SessionSummary;
  settings?: SettingsView;
}

export interface RenderState {
  apiBaseUrl: string;
  data?: RenderData;
  error?: string;
  lastUpdated?: string;
  loading: boolean;
  pendingGoto: boolean;
  screen: SurfaceKey;
  selectedRepoIndex: number;
  statusLines: string[];
}

const sectionDivider = "─".repeat(78);

export function renderApp(state: RenderState): string {
  const lines = [
    `GitPulse TUI preview · ${tuiScreens[state.screen].label}`,
    `API ${state.apiBaseUrl}`,
    "Keys: q quit · Ctrl-R reload · g then d/r/s/a/, switch screens",
    state.screen === "repositories"
      ? "Repo keys: j/k or ↑/↓ move · enter detail"
      : state.screen === "repository_detail"
        ? "Repo detail keys: esc back · i import repo · r refresh repo · t toggle monitor"
        : state.screen === "dashboard"
          ? "Action keys: i import all · r rescan all · b rebuild analytics"
          : "",
    sectionDivider,
  ].filter(Boolean);

  if (state.loading) {
    lines.push("Loading data from the GitPulse backend...", sectionDivider);
  }

  if (state.error) {
    lines.push(
      "Backend status",
      `  ${state.error}`,
      "  Start the Go server with `go run ./cmd/gitpulse serve`, then press Ctrl-R.",
      sectionDivider,
    );
  }

  if (state.data) {
    lines.push(...renderScreen(state));
  } else if (!state.loading) {
    lines.push("No screen data loaded yet.", sectionDivider);
  }

  if (state.statusLines.length > 0 || state.lastUpdated || state.pendingGoto) {
    lines.push("Status");
    if (state.pendingGoto) {
      lines.push("  Waiting for a goto key: d, r, s, a, or ,");
    }
    if (state.lastUpdated) {
      lines.push(`  Last updated: ${state.lastUpdated}`);
    }
    for (const line of state.statusLines) {
      lines.push(`  ${line}`);
    }
    lines.push(sectionDivider);
  }

  return `${lines.join("\n")}\n`;
}

function renderScreen(state: RenderState): string[] {
  switch (state.screen) {
    case "dashboard":
      return renderDashboard(state.data?.dashboard);
    case "repositories":
      return renderRepositories(
        state.data?.repositories ?? [],
        state.selectedRepoIndex,
      );
    case "repository_detail":
      return renderRepositoryDetail(state.data?.repoDetail);
    case "sessions":
      return renderSessions(state.data?.sessions);
    case "achievements":
      return renderAchievements(state.data?.achievements);
    case "settings":
      return renderSettings(state.data?.settings);
  }
}

function renderDashboard(dashboard?: DashboardView): string[] {
  if (!dashboard) {
    return ["Dashboard data unavailable.", sectionDivider];
  }

  const lines = [
    "Today",
    `  Score ${dashboard.summary.today_score} · Active ${formatMinutes(dashboard.summary.active_session_minutes)} · Commits ${dashboard.summary.commits_today} · Pushes ${dashboard.summary.pushes_today}`,
    `  Live ${dashboard.summary.live_lines} lines · Staged ${dashboard.summary.staged_lines} lines · Streak ${dashboard.summary.streak_days}d / best ${dashboard.summary.best_streak_days}d`,
  ];

  if (dashboard.summary.goals.length > 0) {
    lines.push("  Goals");
    for (const goal of dashboard.summary.goals) {
      lines.push(
        `    - ${goal.label}: ${goal.current}/${goal.target} (${goal.percent}%)`,
      );
    }
  }

  lines.push(sectionDivider, "Tracked repositories");
  const repoCards = dashboard.repo_cards.slice(0, 8);
  if (repoCards.length === 0) {
    lines.push("  No tracked repositories yet.");
  } else {
    for (const card of repoCards) {
      lines.push(`  ${renderRepoCard(card)}`);
    }
    if (dashboard.repo_cards.length > repoCards.length) {
      lines.push(
        `  ... ${dashboard.repo_cards.length - repoCards.length} more repositories on the Repositories screen.`,
      );
    }
  }

  lines.push(sectionDivider, "Recent activity");
  const feedItems = dashboard.activity_feed.slice(0, 8);
  if (feedItems.length === 0) {
    lines.push("  No recent activity yet.");
  } else {
    for (const item of feedItems) {
      lines.push(
        `  - ${formatDateTime(item.timestamp)} · ${item.repo_name} · ${item.detail}`,
      );
    }
  }

  lines.push(sectionDivider);
  return lines;
}

function renderRepositories(
  repositories: RepoCard[],
  selectedRepoIndex: number,
): string[] {
  const lines = ["Repositories"];

  if (repositories.length === 0) {
    lines.push("  No tracked repositories yet.", sectionDivider);
    return lines;
  }

  const clampedIndex = Math.max(
    0,
    Math.min(selectedRepoIndex, repositories.length - 1),
  );
  for (const [index, repo] of repositories.entries()) {
    const marker = index === clampedIndex ? ">" : " ";
    lines.push(` ${marker} ${renderRepoCard(repo)}`);
  }
  lines.push(sectionDivider);
  return lines;
}

function renderRepositoryDetail(detail?: RepoDetailView): string[] {
  if (!detail) {
    return [
      "Repository detail unavailable.",
      "  Open the Repositories screen and press Enter on a tracked repository.",
      sectionDivider,
    ];
  }

  const snapshot = detail.card.snapshot;
  const lines = [
    `Repository · ${detail.card.repo.name}`,
    `  State ${detail.card.repo.state} · Health ${detail.card.health}`,
    `  Path ${detail.card.repo.root_path}`,
    `  Remote ${detail.card.repo.remote_url ?? "-"}`,
    `  Branch ${snapshot?.branch ?? "-"} · Ahead ${snapshot?.ahead_count ?? 0} · Behind ${snapshot?.behind_count ?? 0}`,
    `  Live ${snapshot ? sumLines(snapshot.live_additions, snapshot.live_deletions) : 0} lines · Staged ${snapshot ? sumLines(snapshot.staged_additions, snapshot.staged_deletions) : 0} lines · Files ${snapshot?.files_touched ?? 0}`,
    sectionDivider,
    "Patterns",
    `  Include: ${renderList(detail.include_patterns)}`,
    `  Exclude: ${renderList(detail.exclude_patterns)}`,
    sectionDivider,
    "Recent commits",
  ];

  if (detail.recent_commits.length === 0) {
    lines.push("  No commits imported yet.");
  } else {
    for (const commit of detail.recent_commits.slice(0, 5)) {
      lines.push(
        `  - ${formatDateTime(commit.authored_at)} · ${shortSha(commit.commit_sha)} · ${commit.summary}`,
      );
    }
  }

  lines.push(sectionDivider, "Recent pushes");
  if (detail.recent_pushes.length === 0) {
    lines.push("  No push events yet.");
  } else {
    for (const push of detail.recent_pushes.slice(0, 5)) {
      lines.push(
        `  - ${formatDateTime(push.observed_at)} · ${pushKindLabel(push.kind)} · ${push.pushed_commit_count} commit(s) · ${shortSha(push.head_sha)}`,
      );
    }
  }

  lines.push(sectionDivider, "Recent sessions");
  if (detail.recent_sessions.length === 0) {
    lines.push("  No sessions yet.");
  } else {
    for (const session of detail.recent_sessions.slice(0, 5)) {
      lines.push(
        `  - ${formatDateTime(session.started_at)} → ${formatDateTime(session.ended_at)} · ${formatMinutes(session.active_minutes)} · ${session.event_count} events`,
      );
    }
  }

  lines.push(sectionDivider, "Top files");
  if (detail.top_files.length === 0) {
    lines.push("  No file activity yet.");
  } else {
    for (const file of detail.top_files.slice(0, 8)) {
      lines.push(`  - ${file}`);
    }
  }

  lines.push(sectionDivider);
  return lines;
}

function renderSessions(summary?: SessionSummary): string[] {
  if (!summary) {
    return ["Session data unavailable.", sectionDivider];
  }

  const lines = [
    "Sessions",
    `  Total ${formatMinutes(summary.total_minutes)} · Average ${formatMinutes(summary.average_length_minutes)} · Longest ${formatMinutes(summary.longest_session_minutes)}`,
    sectionDivider,
  ];

  if (summary.sessions.length === 0) {
    lines.push("  No sessions yet.", sectionDivider);
    return lines;
  }

  for (const session of summary.sessions.slice(0, 10)) {
    lines.push(
      `  - ${formatDateTime(session.started_at)} → ${formatDateTime(session.ended_at)} · ${formatMinutes(session.active_minutes)} · repos ${session.repo_ids.length} · events ${session.event_count}`,
    );
  }
  lines.push(sectionDivider);
  return lines;
}

function renderAchievements(view?: AchievementsView): string[] {
  if (!view) {
    return ["Achievements data unavailable.", sectionDivider];
  }

  const lines = [
    "Achievements",
    `  Today score ${view.today_score} · Current streak ${view.streaks.current_days}d · Best streak ${view.streaks.best_days}d`,
    sectionDivider,
  ];

  if (view.achievements.length === 0) {
    lines.push("  No achievements unlocked yet.", sectionDivider);
    return lines;
  }

  for (const achievement of view.achievements.slice(0, 10)) {
    lines.push(
      `  - ${formatDateTime(achievement.unlocked_at)} · ${achievement.kind} · ${achievement.reason}`,
    );
  }
  lines.push(sectionDivider);
  return lines;
}

function renderSettings(settings?: SettingsView): string[] {
  if (!settings) {
    return ["Settings data unavailable.", sectionDivider];
  }

  const githubTokenConfigured = Boolean(settings.config.github.token?.trim());
  return [
    "Settings",
    `  Config file ${settings.paths.config_file}`,
    `  Data dir ${settings.paths.data_dir}`,
    `  Timezone ${settings.config.ui.timezone} · Day boundary ${settings.config.ui.day_boundary_minutes}m · Session gap ${settings.config.monitoring.session_gap_minutes}m`,
    `  Goals lines ${settings.config.goals.changed_lines_per_day} · commits ${settings.config.goals.commits_per_day} · focus ${settings.config.goals.focus_minutes_per_day}m`,
    `  Import window ${settings.config.monitoring.import_days}d · Discovery depth ${settings.config.monitoring.repo_discovery_depth ?? "-"}`,
    `  Default include ${renderList(settings.config.patterns.include)} · Default exclude ${renderList(settings.config.patterns.exclude)}`,
    `  GitHub enabled ${settings.config.github.enabled ? "yes" : "no"} · verify pushes ${settings.config.github.verify_remote_pushes ? "yes" : "no"} · token configured ${githubTokenConfigured ? "yes" : "no"}`,
    `  Authors ${settings.config.authors.map((author) => `${author.name ?? "-"} <${author.email}>`).join(", ") || "-"}`,
    sectionDivider,
  ];
}

function renderRepoCard(card: RepoCard): string {
  const snapshot = card.snapshot;
  const branch = snapshot?.branch ?? "-";
  const live = snapshot
    ? `live ${sumLines(snapshot.live_additions, snapshot.live_deletions)}`
    : "live -";
  const staged = snapshot
    ? `staged ${sumLines(snapshot.staged_additions, snapshot.staged_deletions)}`
    : "staged -";
  return `${card.repo.name} [${card.repo.state}/${card.health}] · ${branch} · ${live} · ${staged} · ahead ${snapshot?.ahead_count ?? 0} behind ${snapshot?.behind_count ?? 0}`;
}

function renderList(values: string[]): string {
  if (values.length === 0) {
    return "-";
  }
  return values.join(", ");
}
