import type { SurfaceKey } from "@gitpulse/shared";

export interface CliOptions {
  once: boolean;
  screen: SurfaceKey;
  repoSelector?: string;
}

const screenAliases: Record<string, SurfaceKey> = {
  dashboard: "dashboard",
  repositories: "repositories",
  repository_detail: "repository_detail",
  "repository-detail": "repository_detail",
  detail: "repository_detail",
  repo: "repositories",
  sessions: "sessions",
  achievements: "achievements",
  settings: "settings",
};

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    once: false,
    screen: "dashboard",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--once":
        options.once = true;
        break;
      case "--screen": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --screen.");
        }
        options.screen = normalizeScreen(value);
        index += 1;
        break;
      }
      case "--repo": {
        const value = argv[index + 1];
        if (!value) {
          throw new Error("Missing value for --repo.");
        }
        options.repoSelector = value;
        index += 1;
        break;
      }
      case "--help":
      case "-h":
        throw new Error(helpText());
      default:
        throw new Error(`Unknown argument: ${token}\n\n${helpText()}`);
    }
  }

  if (options.repoSelector && options.screen === "dashboard") {
    options.screen = "repository_detail";
  }

  return options;
}

export function helpText(): string {
  return [
    "GitPulse TUI preview",
    "",
    "Options:",
    "  --screen <dashboard|repositories|repository-detail|sessions|achievements|settings>",
    "  --repo <id|name|path>",
    "  --once",
  ].join("\n");
}

function normalizeScreen(value: string): SurfaceKey {
  const normalized = screenAliases[value.trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported screen: ${value}`);
  }
  return normalized;
}
