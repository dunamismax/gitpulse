export type SurfaceKey =
  | "dashboard"
  | "repositories"
  | "repository_detail"
  | "sessions"
  | "achievements"
  | "settings";

export interface SurfaceDefinition {
  key: SurfaceKey;
  label: string;
  description: string;
  reads: string[];
  actions: string[];
}

export interface WebRouteDefinition extends SurfaceDefinition {
  kind: "page";
  path: string;
}

export interface TuiScreenDefinition extends SurfaceDefinition {
  kind: "screen";
  screenId: string;
  hotkey: string;
}

const surfaceDefinitions: Record<SurfaceKey, SurfaceDefinition> = {
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    description:
      "Headline metrics, activity feed, trends, and repository status at a glance.",
    reads: ["GET /api/dashboard"],
    actions: [
      "POST /api/actions/import",
      "POST /api/actions/rescan",
      "POST /api/actions/rebuild",
    ],
  },
  repositories: {
    key: "repositories",
    label: "Repositories",
    description:
      "Tracked targets and repository inventory for add, remove, toggle, and refresh flows.",
    reads: ["GET /api/repositories"],
    actions: ["POST /api/repositories/add"],
  },
  repository_detail: {
    key: "repository_detail",
    label: "Repository Detail",
    description:
      "Repository-specific health, patterns, sessions, pushes, and imported commit history.",
    reads: ["GET /api/repositories/{id}"],
    actions: [
      "POST /api/repositories/{id}/refresh",
      "POST /api/repositories/{id}/toggle",
      "POST /api/repositories/{id}/remove",
      "POST /api/repositories/{id}/patterns",
      "POST /api/repositories/{id}/import",
    ],
  },
  sessions: {
    key: "sessions",
    label: "Sessions",
    description: "Focus-session history and aggregate session metrics.",
    reads: ["GET /api/sessions"],
    actions: [],
  },
  achievements: {
    key: "achievements",
    label: "Achievements",
    description: "Unlocked achievements, streaks, and current score.",
    reads: ["GET /api/achievements"],
    actions: [],
  },
  settings: {
    key: "settings",
    label: "Settings",
    description:
      "Author identity, goals, monitoring, patterns, and GitHub integration settings.",
    reads: ["GET /api/settings"],
    actions: ["POST /api/settings"],
  },
};

export const webRoutes: Record<SurfaceKey, WebRouteDefinition> = {
  dashboard: {
    ...surfaceDefinitions.dashboard,
    kind: "page",
    path: "/",
  },
  repositories: {
    ...surfaceDefinitions.repositories,
    kind: "page",
    path: "/repositories",
  },
  repository_detail: {
    ...surfaceDefinitions.repository_detail,
    kind: "page",
    path: "/repositories/:repoId",
  },
  sessions: {
    ...surfaceDefinitions.sessions,
    kind: "page",
    path: "/sessions",
  },
  achievements: {
    ...surfaceDefinitions.achievements,
    kind: "page",
    path: "/achievements",
  },
  settings: {
    ...surfaceDefinitions.settings,
    kind: "page",
    path: "/settings",
  },
};

export const tuiScreens: Record<SurfaceKey, TuiScreenDefinition> = {
  dashboard: {
    ...surfaceDefinitions.dashboard,
    kind: "screen",
    screenId: "dashboard",
    hotkey: "g d",
  },
  repositories: {
    ...surfaceDefinitions.repositories,
    kind: "screen",
    screenId: "repositories",
    hotkey: "g r",
  },
  repository_detail: {
    ...surfaceDefinitions.repository_detail,
    kind: "screen",
    screenId: "repository-detail",
    hotkey: "enter",
  },
  sessions: {
    ...surfaceDefinitions.sessions,
    kind: "screen",
    screenId: "sessions",
    hotkey: "g s",
  },
  achievements: {
    ...surfaceDefinitions.achievements,
    kind: "screen",
    screenId: "achievements",
    hotkey: "g a",
  },
  settings: {
    ...surfaceDefinitions.settings,
    kind: "screen",
    screenId: "settings",
    hotkey: "g ,",
  },
};

export const surfaceKeys = Object.keys(surfaceDefinitions) as SurfaceKey[];
