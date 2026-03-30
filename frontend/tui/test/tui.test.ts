import { describe, expect, test } from "bun:test";

import { tuiScreens } from "@gitpulse/shared";

import { renderFoundationShell } from "../src/render";

describe("tui foundation", () => {
  test("renders the planned screen map against dashboard data", () => {
    const output = renderFoundationShell(
      {
        summary: {
          live_lines: 10,
          staged_lines: 3,
          commits_today: 1,
          pushes_today: 0,
          active_session_minutes: 42,
          streak_days: 2,
          best_streak_days: 5,
          today_score: 77,
          goals: [],
        },
        activity_feed: [],
        trend_points: [],
        heatmap_days: [],
        repo_cards: [],
      },
      Object.values(tuiScreens),
      "http://127.0.0.1:7467",
    );

    expect(output).toContain("GitPulse TUI foundation shell");
    expect(output).toContain("dashboard");
    expect(output).toContain("http://127.0.0.1:7467");
  });
});
