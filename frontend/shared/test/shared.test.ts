import { describe, expect, test } from "bun:test";

import {
  buildTransportMessage,
  createGitPulseClient,
  defaultApiBaseUrl,
  formatMinutes,
  heatmapClass,
  shortSha,
  sumLines,
  surfaceKeys,
  tuiScreens,
  webRoutes,
} from "../src";

describe("shared client", () => {
  test("unwraps dashboard data from the Go envelope and normalizes nullable arrays", async () => {
    const client = createGitPulseClient({
      baseUrl: "http://127.0.0.1:7467",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            data: {
              summary: {
                live_lines: 10,
                staged_lines: 4,
                commits_today: 1,
                pushes_today: 0,
                active_session_minutes: 25,
                streak_days: 2,
                best_streak_days: 4,
                today_score: 80,
                goals: [],
              },
              activity_feed: null,
              trend_points: null,
              heatmap_days: null,
              repo_cards: null,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        ),
    });

    const dashboard = await client.dashboard();
    expect(dashboard.summary.today_score).toBe(80);
    expect(dashboard.activity_feed).toEqual([]);
    expect(dashboard.repo_cards).toEqual([]);
  });

  test("normalizes nullable repository collections", async () => {
    const client = createGitPulseClient({
      fetcher: async () =>
        new Response(JSON.stringify({ data: { repositories: null } }), {
          headers: { "Content-Type": "application/json" },
        }),
    });

    await expect(client.repositories()).resolves.toEqual([]);
  });

  test("builds actionable backend transport messaging", () => {
    const message = buildTransportMessage(
      "http://127.0.0.1:7467",
      "Could not reach the GitPulse backend.",
    );
    expect(message).toContain("go run ./cmd/gitpulse serve");
    expect(message).toContain("GITPULSE_API_BASE_URL");
  });

  test("resolves the default live backend origin", () => {
    expect(defaultApiBaseUrl({})).toBe("http://127.0.0.1:7467");
    expect(
      defaultApiBaseUrl({ GITPULSE_API_BASE_URL: "http://localhost:9000" }),
    ).toBe("http://localhost:9000");
  });
});

describe("shared presentation utilities", () => {
  test("formats durations and diffs", () => {
    expect(formatMinutes(25)).toBe("25m");
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(sumLines(12, 4)).toBe(16);
    expect(shortSha("1234567890")).toBe("1234567");
  });

  test("maps heatmap tiers", () => {
    expect(heatmapClass(0)).toBe("heat-empty");
    expect(heatmapClass(10)).toBe("heat-light");
    expect(heatmapClass(50)).toBe("heat-medium");
    expect(heatmapClass(90)).toBe("heat-strong");
  });
});

describe("shared surface definitions", () => {
  test("keeps web and TUI maps aligned to the same domain keys", () => {
    expect(surfaceKeys).toEqual(Object.keys(webRoutes) as typeof surfaceKeys);
    expect(surfaceKeys).toEqual(Object.keys(tuiScreens) as typeof surfaceKeys);
    expect(webRoutes.repository_detail.path).toBe("/repositories/:repoId");
    expect(tuiScreens.repository_detail.screenId).toBe("repository-detail");
  });
});
