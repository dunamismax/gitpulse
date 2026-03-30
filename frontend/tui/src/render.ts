import {
  type DashboardView,
  formatMinutes,
  type TuiScreenDefinition,
} from "@gitpulse/shared";

export function renderFoundationShell(
  dashboard: DashboardView,
  screens: TuiScreenDefinition[],
  apiBaseUrl: string,
): string {
  const lines = [
    "GitPulse TUI foundation shell",
    "",
    `API base URL: ${apiBaseUrl}`,
    `Tracked repositories: ${dashboard.repo_cards.length}`,
    `Today score: ${dashboard.summary.today_score}`,
    `Active session: ${formatMinutes(dashboard.summary.active_session_minutes)}`,
    "",
    "Planned screen map:",
    ...screens.map(
      (screen) => `- ${screen.label} (${screen.screenId}) [${screen.hotkey}]`,
    ),
    "",
    "Phase 4 has not started. This shell exists only to prove the TUI lane can boot against the Go backend without inventing its own contract.",
  ];

  return lines.join("\n");
}
