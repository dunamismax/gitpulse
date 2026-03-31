import { describe, expect, test } from "bun:test";

import type { RepoCard } from "@gitpulse/shared";

import { parseCliArgs } from "../src/cli";
import { type RenderState, renderApp } from "../src/render";

function makeRepoCard(index: number): RepoCard {
  const suffix = `${index}`;
  return {
    repo: {
      id: `repo-${suffix}`,
      target_id: null,
      name: `gitpulse-${suffix}`,
      root_path: `/tmp/gitpulse-${suffix}`,
      remote_url: null,
      default_branch: "main",
      include_patterns: [],
      exclude_patterns: [],
      is_monitored: index % 2 === 1,
      state: "active",
      created_at: "2026-03-30T00:00:00Z",
      updated_at: "2026-03-31T00:00:00Z",
      last_error: null,
    },
    snapshot: {
      id: `snapshot-${suffix}`,
      repo_id: `repo-${suffix}`,
      observed_at: "2026-03-31T00:00:00Z",
      branch: "main",
      is_detached: false,
      head_sha: "abcdef1234567",
      upstream_ref: "origin/main",
      upstream_head_sha: "abcdef1234567",
      ahead_count: index % 3,
      behind_count: index % 2,
      live_additions: 8 + index,
      live_deletions: 2,
      live_files: 3,
      staged_additions: 2,
      staged_deletions: 1,
      staged_files: 1,
      files_touched: 4,
      repo_size_bytes: 2048,
      language_breakdown: [],
    },
    health: "Healthy",
    metrics: {
      scope: `repo-${suffix}`,
      day: "2026-03-31",
      live_additions: 8 + index,
      live_deletions: 2,
      staged_additions: 2,
      staged_deletions: 1,
      committed_additions: 10,
      committed_deletions: 2,
      commits: index,
      pushes: index % 2,
      focus_minutes: 30 + index,
      files_touched: 4,
      languages_touched: 1,
      score: 70 + index,
    },
    sparkline: [1, 3, 2],
  };
}

const repositories = [makeRepoCard(1), makeRepoCard(2), makeRepoCard(3)];

const baseState: RenderState = {
  apiBaseUrl: "http://127.0.0.1:7467",
  data: {
    dashboard: {
      summary: {
        live_lines: 10,
        staged_lines: 3,
        commits_today: 1,
        pushes_today: 0,
        active_session_minutes: 42,
        streak_days: 2,
        best_streak_days: 5,
        today_score: 77,
        goals: [
          {
            label: "Focus",
            current: 42,
            target: 120,
            percent: 35,
          },
        ],
      },
      activity_feed: [
        {
          kind: "commit",
          repo_name: "gitpulse-1",
          timestamp: "2026-03-31T00:05:00Z",
          detail: "Imported 1 commit",
        },
      ],
      trend_points: [],
      heatmap_days: [],
      repo_cards: repositories,
    },
    repositories,
    sessions: {
      sessions: [
        {
          id: "session-1",
          started_at: "2026-03-30T22:00:00Z",
          ended_at: "2026-03-30T22:45:00Z",
          active_minutes: 45,
          repo_ids: ["repo-1"],
          event_count: 4,
          total_changed_lines: 18,
        },
      ],
      total_minutes: 45,
      average_length_minutes: 45,
      longest_session_minutes: 45,
    },
    achievements: {
      achievements: [
        {
          kind: "hot_streak",
          unlocked_at: "2026-03-30T23:00:00Z",
          day: "2026-03-30",
          reason: "Two day streak",
        },
      ],
      streaks: {
        current_days: 2,
        best_days: 5,
      },
      today_score: 77,
    },
    settings: {
      config: {
        authors: [
          {
            email: "stephen@example.com",
            name: "Stephen Sawyer",
            aliases: [],
          },
        ],
        goals: {
          changed_lines_per_day: 250,
          commits_per_day: 2,
          focus_minutes_per_day: 120,
        },
        patterns: {
          include: ["src/**"],
          exclude: ["node_modules/**"],
        },
        github: {
          enabled: false,
          token: "",
          verify_remote_pushes: false,
        },
        monitoring: {
          import_days: 30,
          session_gap_minutes: 45,
          repo_discovery_depth: 3,
        },
        ui: {
          timezone: "America/New_York",
          day_boundary_minutes: 0,
        },
        database: {
          path: "/tmp/gitpulse.db",
        },
        server: {
          host: "127.0.0.1",
          port: 7467,
        },
      },
      paths: {
        config_dir: "/tmp",
        data_dir: "/tmp/data",
        config_file: "/tmp/gitpulse.toml",
      },
    },
    repoDetail: {
      card: repositories[0],
      include_patterns: ["src/**"],
      exclude_patterns: ["node_modules/**"],
      recent_commits: [
        {
          id: "commit-1",
          repo_id: "repo-1",
          commit_sha: "abcdef1234567",
          authored_at: "2026-03-30T23:30:00Z",
          author_name: "Stephen Sawyer",
          author_email: "stephen@example.com",
          summary: "Ship the TUI preview",
          branch: "main",
          additions: 10,
          deletions: 2,
          files_changed: 3,
          is_merge: false,
          imported_at: "2026-03-30T23:35:00Z",
        },
      ],
      recent_pushes: [],
      recent_sessions: [
        {
          id: "session-1",
          started_at: "2026-03-30T22:00:00Z",
          ended_at: "2026-03-30T22:45:00Z",
          active_minutes: 45,
          repo_ids: ["repo-1"],
          event_count: 4,
          total_changed_lines: 18,
        },
      ],
      language_breakdown: [],
      top_files: ["cmd/gitpulse/main.go"],
    },
  },
  error: undefined,
  lastUpdated: "3/31/2026, 12:10:00 AM",
  loading: false,
  pendingGoto: false,
  screen: "dashboard",
  selectedRepoIndex: 0,
  statusLines: ["Loaded GitPulse terminal preview."],
};

describe("tui preview", () => {
  test("renders the dashboard preview against live-shaped data", () => {
    const output = renderApp(baseState);

    expect(output).toContain("GitPulse TUI preview · Dashboard");
    expect(output).toContain("Score 77");
    expect(output).toContain("gitpulse-1 [active/Healthy]");
    expect(output).toContain("Loaded GitPulse terminal preview.");
  });

  test("renders the repositories screen with selected repo quick actions", () => {
    const output = renderApp({
      ...baseState,
      screen: "repositories",
      selectedRepoIndex: 1,
    });

    expect(output).toContain("selected 2/3");
    expect(output).toContain("Selected repository");
    expect(output).toContain("Quick actions: i import selected repo");
    expect(output).toContain("> gitpulse-2 [active/Healthy] · main · live 12 · staged 3",
    );
  });

  test("renders repository detail guidance and repo position", () => {
    const output = renderApp({
      ...baseState,
      screen: "repository_detail",
    });

    expect(output).toContain("Repo detail keys: esc/h back · [ prev repo · ] next repo");
    expect(output).toContain("Repository · gitpulse-1");
    expect(output).toContain("Selection 1/3");
    expect(output).toContain("Ship the TUI preview");
    expect(output).toContain("cmd/gitpulse/main.go");
  });

  test("collapses long repository lists around the current selection", () => {
    const manyRepositories = Array.from({ length: 14 }, (_, index) =>
      makeRepoCard(index + 1),
    );
    const output = renderApp({
      ...baseState,
      data: {
        ...baseState.data,
        repositories: manyRepositories,
      },
      screen: "repositories",
      selectedRepoIndex: 9,
    });

    expect(output).toContain("... 4 repository(s) above");
    expect(output).toContain("> gitpulse-10 [active/Healthy] · main · live 20 · staged 3",
    );
    expect(output).not.toContain("... 1 repository(s) below");
  });

  test("parses repo selector into repository detail mode", () => {
    const options = parseCliArgs(["--repo", "gitpulse", "--once"]);

    expect(options.repoSelector).toBe("gitpulse");
    expect(options.once).toBe(true);
    expect(options.screen).toBe("repository_detail");
  });
});
