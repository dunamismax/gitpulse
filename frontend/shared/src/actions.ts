export type OperatorActionKey =
  | "add_target"
  | "refresh_repo"
  | "toggle_repo"
  | "remove_repo"
  | "save_repo_patterns"
  | "import_repo"
  | "import_all"
  | "rescan_all"
  | "rebuild_analytics"
  | "save_settings";

export interface OperatorActionDefinition {
  key: OperatorActionKey;
  scope: "global" | "repository" | "settings";
  method: "POST";
  path: string;
  description: string;
}

export const operatorActions: Record<
  OperatorActionKey,
  OperatorActionDefinition
> = {
  add_target: {
    key: "add_target",
    scope: "global",
    method: "POST",
    path: "/api/repositories/add",
    description:
      "Register one repository or a parent folder as a tracked target.",
  },
  refresh_repo: {
    key: "refresh_repo",
    scope: "repository",
    method: "POST",
    path: "/api/repositories/:repoId/refresh",
    description: "Refresh live git state for one repository.",
  },
  toggle_repo: {
    key: "toggle_repo",
    scope: "repository",
    method: "POST",
    path: "/api/repositories/:repoId/toggle",
    description: "Toggle repository monitoring on or off.",
  },
  remove_repo: {
    key: "remove_repo",
    scope: "repository",
    method: "POST",
    path: "/api/repositories/:repoId/remove",
    description: "Remove a repository from the active operator set.",
  },
  save_repo_patterns: {
    key: "save_repo_patterns",
    scope: "repository",
    method: "POST",
    path: "/api/repositories/:repoId/patterns",
    description: "Save include and exclude patterns for one repository.",
  },
  import_repo: {
    key: "import_repo",
    scope: "repository",
    method: "POST",
    path: "/api/repositories/:repoId/import",
    description: "Import commit history for one repository.",
  },
  import_all: {
    key: "import_all",
    scope: "global",
    method: "POST",
    path: "/api/actions/import",
    description: "Import commit history for all tracked repositories.",
  },
  rescan_all: {
    key: "rescan_all",
    scope: "global",
    method: "POST",
    path: "/api/actions/rescan",
    description:
      "Refresh live working tree state across all monitored repositories.",
  },
  rebuild_analytics: {
    key: "rebuild_analytics",
    scope: "global",
    method: "POST",
    path: "/api/actions/rebuild",
    description:
      "Rebuild sessions, rollups, and achievements from stored events.",
  },
  save_settings: {
    key: "save_settings",
    scope: "settings",
    method: "POST",
    path: "/api/settings",
    description: "Persist GitPulse settings back to the active config file.",
  },
};
