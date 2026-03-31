import {
  type ActionPayload,
  createGitPulseClient,
  defaultApiBaseUrl,
  GitPulseClientError,
  type RepoCard,
  type SurfaceKey,
  tuiScreens,
} from "@gitpulse/shared";

import { helpText, parseCliArgs } from "./cli";
import { type RenderData, type RenderState, renderApp } from "./render";

interface AppOptions {
  once: boolean;
  repoSelector?: string;
  screen: SurfaceKey;
}

const repositoryPageStep = 5;

class GitPulseTuiPreview {
  readonly #client = createGitPulseClient({
    baseUrl: defaultApiBaseUrl({
      GITPULSE_API_BASE_URL: process.env.GITPULSE_API_BASE_URL,
    }),
  });

  readonly #options: AppOptions;

  readonly #state: RenderState;

  #done?: () => void;
  #busy = false;
  #lastRepoSearch = "";

  constructor(options: AppOptions) {
    this.#options = options;
    this.#state = {
      apiBaseUrl: this.#client.baseUrl,
      loading: true,
      pendingGoto: false,
      pendingSearch: false,
      repoSearchQuery: "",
      screen: options.screen,
      selectedRepoIndex: 0,
      statusLines: [
        "Dashboard, repositories, sessions, achievements, and settings all come from the live Go API.",
      ],
    };
  }

  async start(): Promise<void> {
    await this.reload("Loaded GitPulse terminal preview.", true);

    if (this.#options.once || !process.stdin.isTTY || !process.stdout.isTTY) {
      process.stdout.write(renderApp(this.#state));
      return;
    }

    this.render();
    await this.runInteractiveLoop();
  }

  private async runInteractiveLoop(): Promise<void> {
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();

    const onData = (chunk: Buffer | string) => {
      void this.handleKey(String(chunk));
    };
    const onSignal = () => {
      this.stop();
    };

    stdin.on("data", onData);
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    await new Promise<void>((resolve) => {
      this.#done = resolve;
    });

    stdin.off("data", onData);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    stdin.setRawMode?.(false);
    stdin.pause();
  }

  private async handleKey(key: string): Promise<void> {
    if (key === "\u0003") {
      this.stop();
      return;
    }

    if (this.#state.pendingSearch) {
      await this.handleRepositorySearchKey(key);
      return;
    }

    if (key === "q") {
      this.stop();
      return;
    }

    if (this.#busy) {
      return;
    }

    if (this.#state.pendingGoto) {
      this.#state.pendingGoto = false;
      const nextScreen = gotoScreenForKey(key);
      if (nextScreen) {
        await this.changeScreen(nextScreen);
      } else {
        this.setStatus(`Unknown goto key: ${JSON.stringify(key)}`);
        this.render();
      }
      return;
    }

    switch (key) {
      case "g":
        this.#state.pendingGoto = true;
        this.render();
        return;
      case "/":
        if (this.isRepositoryScreen()) {
          this.beginRepositorySearch();
        }
        return;
      case "n":
        if (this.isRepositoryScreen()) {
          await this.jumpRepositorySearch(1);
        }
        return;
      case "N":
        if (this.isRepositoryScreen()) {
          await this.jumpRepositorySearch(-1);
        }
        return;
      case "\u0012":
        await this.reload("Reloaded data.", false);
        return;
      case "j":
      case "\u001b[B":
        this.moveSelection(1);
        return;
      case "k":
      case "\u001b[A":
        this.moveSelection(-1);
        return;
      case "\u0004":
      case "\u001b[6~":
        this.moveSelectionPage(1);
        return;
      case "\u0015":
      case "\u001b[5~":
        this.moveSelectionPage(-1);
        return;
      case "\r":
      case "\n":
        if (this.#state.screen === "repositories") {
          await this.openSelectedRepository();
        }
        return;
      case "l":
      case "\u001b[C":
        if (this.#state.screen === "repositories") {
          await this.openSelectedRepository();
        }
        return;
      case "\u001b":
      case "\u007f":
      case "h":
      case "\u001b[D":
        if (this.#state.screen === "repository_detail") {
          this.backToRepositories();
        }
        return;
      case "[":
        if (this.#state.screen === "repository_detail") {
          await this.openAdjacentRepository(-1);
        }
        return;
      case "]":
        if (this.#state.screen === "repository_detail") {
          await this.openAdjacentRepository(1);
        }
        return;
      default:
        break;
    }

    if (this.#state.screen === "dashboard") {
      switch (key) {
        case "i":
          await this.runGlobalAction(
            "Importing history for all tracked repositories...",
            () =>
              this.#client.importAll(
                this.#state.data?.settings?.config.monitoring.import_days ?? 30,
              ),
          );
          return;
        case "r":
          await this.runGlobalAction(
            "Rescanning all tracked repositories...",
            () => this.#client.rescanAll(),
          );
          return;
        case "b":
          await this.runGlobalAction("Rebuilding analytics...", () =>
            this.#client.rebuildAnalytics(),
          );
          return;
        default:
          return;
      }
    }

    if (this.isRepositoryScreen()) {
      switch (key) {
        case "i":
          await this.runRepositoryAction(
            "Importing history for the selected repository...",
            (repo) =>
              this.#client.importRepository(
                repo.repo.id,
                this.#state.data?.settings?.config.monitoring.import_days ?? 30,
              ),
          );
          return;
        case "r":
          await this.runRepositoryAction(
            "Refreshing live state for the selected repository...",
            (repo) => this.#client.refreshRepository(repo.repo.id),
          );
          return;
        case "t":
          await this.runRepositoryAction(
            "Toggling monitoring for the selected repository...",
            (repo) => this.#client.toggleRepository(repo.repo.id),
          );
          return;
        default:
          return;
      }
    }
  }

  private async changeScreen(screen: SurfaceKey): Promise<void> {
    this.#state.screen = screen;
    if (screen === "repository_detail") {
      await this.openSelectedRepository();
      return;
    }
    this.setStatus(`Switched to ${tuiScreens[screen].label}.`);
    this.render();
  }

  private backToRepositories(): void {
    this.#state.screen = "repositories";
    this.setStatus("Returned to repositories.");
    this.render();
  }

  private isRepositoryScreen(): boolean {
    return (
      this.#state.screen === "repositories" ||
      this.#state.screen === "repository_detail"
    );
  }

  private beginRepositorySearch(): void {
    this.#state.pendingSearch = true;
    this.#state.repoSearchQuery = "";
    this.setStatus("Repository search started.");
    this.render();
  }

  private async handleRepositorySearchKey(key: string): Promise<void> {
    switch (key) {
      case "\u001b":
        this.#state.pendingSearch = false;
        this.#state.repoSearchQuery = "";
        this.setStatus("Repository search cancelled.");
        this.render();
        return;
      case "\r":
      case "\n": {
        const query = this.#state.repoSearchQuery.trim();
        this.#state.pendingSearch = false;
        this.#state.repoSearchQuery = query;
        if (!query) {
          this.setStatus("Repository search cancelled.");
          this.render();
          return;
        }
        await this.applyRepositorySearch(query, 1, true);
        return;
      }
      case "\u007f":
      case "\b":
        this.#state.repoSearchQuery = this.#state.repoSearchQuery.slice(0, -1);
        this.render();
        return;
      default:
        break;
    }

    if (/^[\x20-\x7e]+$/.test(key)) {
      this.#state.repoSearchQuery += key;
      this.render();
    }
  }

  private async jumpRepositorySearch(direction: 1 | -1): Promise<void> {
    const query = this.#lastRepoSearch.trim();
    if (!query) {
      this.setStatus("No previous repository search. Press / to search first.");
      this.render();
      return;
    }

    await this.applyRepositorySearch(query, direction, false);
  }

  private async applyRepositorySearch(
    query: string,
    direction: 1 | -1,
    includeCurrent: boolean,
  ): Promise<void> {
    const repositories = this.#state.data?.repositories ?? [];
    if (repositories.length === 0) {
      this.setStatus("No repositories available to search.");
      this.render();
      return;
    }

    const matchIndex = findRepositoryMatchIndex(
      repositories,
      query,
      this.#state.selectedRepoIndex,
      direction,
      includeCurrent,
    );
    if (matchIndex < 0) {
      this.setStatus(`No repository matched \"${query}\".`);
      this.render();
      return;
    }

    this.#lastRepoSearch = query;
    this.#state.selectedRepoIndex = matchIndex;
    const selected = repositories[matchIndex];

    if (this.#state.screen === "repository_detail") {
      await this.openSelectedRepository();
      return;
    }

    this.setStatus(`Selected ${selected.repo.name} via search \"${query}\".`);
    this.render();
  }

  private moveSelection(delta: number): void {
    if (this.#state.screen !== "repositories") {
      return;
    }

    const repositories = this.#state.data?.repositories ?? [];
    if (repositories.length === 0) {
      return;
    }

    this.#state.selectedRepoIndex = clampIndex(
      this.#state.selectedRepoIndex + delta,
      repositories.length,
    );
    const selected = repositories[this.#state.selectedRepoIndex];
    this.setStatus(`Selected ${selected.repo.name}.`);
    this.render();
  }

  private moveSelectionPage(direction: 1 | -1): void {
    if (this.#state.screen !== "repositories") {
      return;
    }

    this.moveSelection(direction * repositoryPageStep);
  }

  private async openSelectedRepository(): Promise<void> {
    const repo = this.selectedRepository();
    if (!repo) {
      this.setStatus("No repository selected.");
      this.render();
      return;
    }

    await this.runBusy(`Loading ${repo.repo.name}...`, async () => {
      const detail = await this.#client.repositoryDetail(repo.repo.id);
      this.#state.screen = "repository_detail";
      this.#state.data = {
        ...this.#state.data,
        repoDetail: detail,
      };
      this.setStatus(`Opened ${repo.repo.name}.`);
    });
  }

  private async openAdjacentRepository(delta: number): Promise<void> {
    const repositories = this.#state.data?.repositories ?? [];
    if (repositories.length === 0) {
      this.setStatus("No repository selected.");
      this.render();
      return;
    }

    const nextIndex = clampIndex(
      this.#state.selectedRepoIndex + delta,
      repositories.length,
    );
    if (nextIndex === this.#state.selectedRepoIndex) {
      const edgeLabel = delta < 0 ? "first" : "last";
      this.setStatus(`Already at the ${edgeLabel} tracked repository.`);
      this.render();
      return;
    }

    this.#state.selectedRepoIndex = nextIndex;
    await this.openSelectedRepository();
  }

  private async runGlobalAction(
    status: string,
    action: () => Promise<ActionPayload>,
  ): Promise<void> {
    await this.runBusy(status, async () => {
      const payload = await action();
      this.setActionStatus(payload);
      await this.loadData();
    });
  }

  private async runRepositoryAction(
    status: string,
    action: (repo: RepoCard) => Promise<ActionPayload>,
  ): Promise<void> {
    const repo = this.selectedRepository();
    if (!repo) {
      this.setStatus("No repository selected.");
      this.render();
      return;
    }

    await this.runBusy(status, async () => {
      const payload = await action(repo);
      this.setActionStatus(payload);
      await this.loadData();
      const refreshedRepo = this.selectedRepository();
      if (refreshedRepo && this.#state.screen === "repository_detail") {
        this.#state.data = {
          ...this.#state.data,
          repoDetail: await this.#client.repositoryDetail(
            refreshedRepo.repo.id,
          ),
        };
      }
    });
  }

  private async reload(
    status: string,
    preferRequestedScreen: boolean,
  ): Promise<void> {
    await this.runBusy(status, async () => {
      await this.loadData();
      if (preferRequestedScreen && this.#options.repoSelector) {
        this.selectRepository(this.#options.repoSelector);
      }
      if (this.#state.screen === "repository_detail") {
        const repo = this.selectedRepository();
        if (repo) {
          this.#state.data = {
            ...this.#state.data,
            repoDetail: await this.#client.repositoryDetail(repo.repo.id),
          };
        }
      }
    });
  }

  private async loadData(): Promise<void> {
    const [dashboard, repositories, sessions, achievements, settings] =
      await Promise.all([
        this.#client.dashboard(),
        this.#client.repositories(),
        this.#client.sessions(),
        this.#client.achievements(),
        this.#client.settings(),
      ]);

    const nextData: RenderData = {
      achievements,
      dashboard,
      repositories,
      sessions,
      settings,
    };

    if (this.#options.repoSelector) {
      const index = findRepositoryIndex(
        repositories,
        this.#options.repoSelector,
      );
      if (index >= 0) {
        this.#state.selectedRepoIndex = index;
      }
    }

    if (repositories.length === 0) {
      this.#state.selectedRepoIndex = 0;
      this.#state.screen =
        this.#state.screen === "repository_detail"
          ? "repositories"
          : this.#state.screen;
    } else {
      this.#state.selectedRepoIndex = clampIndex(
        this.#state.selectedRepoIndex,
        repositories.length,
      );
    }

    this.#state.data = nextData;
    this.#state.error = undefined;
    this.#state.lastUpdated = new Date().toLocaleString();
  }

  private selectRepository(selector: string): void {
    const repositories = this.#state.data?.repositories ?? [];
    const index = findRepositoryIndex(repositories, selector);
    if (index >= 0) {
      this.#state.selectedRepoIndex = index;
    } else {
      this.setStatus(`Repository not found for selector: ${selector}`);
    }
  }

  private selectedRepository(): RepoCard | undefined {
    const repositories = this.#state.data?.repositories ?? [];
    if (repositories.length === 0) {
      return undefined;
    }
    const index = clampIndex(
      this.#state.selectedRepoIndex,
      repositories.length,
    );
    this.#state.selectedRepoIndex = index;
    return repositories[index];
  }

  private async runBusy(
    initialStatus: string,
    task: () => Promise<void>,
  ): Promise<void> {
    this.#busy = true;
    this.#state.loading = true;
    this.setStatus(initialStatus);
    this.render();

    try {
      await task();
    } catch (error) {
      this.#state.error = normalizeError(error);
      this.setStatus(this.#state.error);
    } finally {
      this.#state.loading = false;
      this.#busy = false;
      this.render();
    }
  }

  private setActionStatus(payload: ActionPayload): void {
    const lines = [
      payload.result.title,
      payload.result.summary,
      ...payload.result.lines,
    ];
    if (payload.result.warnings) {
      lines.push(
        ...payload.result.warnings.map((warning) => `warning: ${warning}`),
      );
    }
    this.#state.error = undefined;
    this.#state.statusLines = lines.filter(Boolean).slice(0, 8);
  }

  private setStatus(...lines: string[]): void {
    this.#state.statusLines = lines.filter(Boolean).slice(0, 8);
  }

  private render(): void {
    if (!process.stdout.isTTY) {
      return;
    }
    process.stdout.write("\u001bc");
    process.stdout.write(renderApp(this.#state));
  }

  private stop(): void {
    this.#done?.();
  }
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

function gotoScreenForKey(key: string): SurfaceKey | undefined {
  switch (key) {
    case "d":
      return "dashboard";
    case "r":
      return "repositories";
    case "s":
      return "sessions";
    case "a":
      return "achievements";
    case ",":
      return "settings";
    default:
      return undefined;
  }
}

function findRepositoryIndex(
  repositories: RepoCard[],
  selector: string,
): number {
  const normalized = selector.trim().toLowerCase();
  return repositories.findIndex((repo) => {
    return [repo.repo.id, repo.repo.name, repo.repo.root_path]
      .filter(Boolean)
      .some((value) => value.toLowerCase() === normalized);
  });
}

function findRepositoryMatchIndex(
  repositories: RepoCard[],
  query: string,
  currentIndex: number,
  direction: 1 | -1,
  includeCurrent: boolean,
): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized || repositories.length === 0) {
    return -1;
  }

  const total = repositories.length;
  const startOffset = includeCurrent ? 0 : direction;

  for (let step = startOffset; Math.abs(step) < total; step += direction) {
    const index = normalizeWrappedIndex(currentIndex + step, total);
    if (repositoryMatchesQuery(repositories[index], normalized)) {
      return index;
    }
  }

  return -1;
}

function repositoryMatchesQuery(
  repo: RepoCard,
  normalizedQuery: string,
): boolean {
  return [repo.repo.id, repo.repo.name, repo.repo.root_path]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function normalizeWrappedIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  const wrapped = index % length;
  return wrapped < 0 ? wrapped + length : wrapped;
}

function normalizeError(error: unknown): string {
  if (error instanceof GitPulseClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function main(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const app = new GitPulseTuiPreview(options);
    await app.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (message === helpText()) {
      return;
    }
    process.exitCode = 1;
  }
}

await main();
