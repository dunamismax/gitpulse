import { readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { LanguageStat } from './domain';

export interface GitTouchedPath {
  path: string;
  additions: number;
  deletions: number;
}

export interface GitRepositoryProbe {
  name: string;
  remoteUrl: string | null;
  defaultBranch: string | null;
}

export interface GitSnapshot {
  branch: string | null;
  isDetached: boolean;
  headSha: string | null;
  upstreamRef: string | null;
  upstreamHeadSha: string | null;
  aheadCount: number;
  behindCount: number;
  liveStats: {
    additions: number;
    deletions: number;
    fileCount: number;
  };
  stagedStats: {
    additions: number;
    deletions: number;
    fileCount: number;
  };
  touchedPaths: GitTouchedPath[];
  repoSizeBytes: number;
  languageBreakdown: LanguageStat[];
}

export interface ImportedHistoryCommit {
  commitSha: string;
  authoredAt: Date;
  authorName: string | null;
  authorEmail: string | null;
  summary: string;
  branch: string | null;
  additions: number;
  deletions: number;
  filesChanged: number;
  isMerge: boolean;
  touchedPaths: GitTouchedPath[];
}

export interface SnapshotRepositoryOptions {
  includePatterns?: readonly string[];
  excludePatterns?: readonly string[];
  includeSizeScan?: boolean;
}

export interface ImportHistoryOptions {
  days: number;
  authorEmails?: readonly string[];
  includePatterns?: readonly string[];
  excludePatterns?: readonly string[];
}

export interface GitBackend {
  discoverRepositories(rootPath: string, maxDepth: number): Promise<string[]>;
  probeRepository(rootPath: string): Promise<GitRepositoryProbe>;
  snapshotRepository(
    rootPath: string,
    options?: SnapshotRepositoryOptions
  ): Promise<GitSnapshot>;
  importHistory(
    rootPath: string,
    options: ImportHistoryOptions
  ): Promise<ImportedHistoryCommit[]>;
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function normalizeExitCode(code: number | null | undefined) {
  return typeof code === 'number' ? code : 1;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<GitCommandResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    stdout,
    stderr,
    exitCode: normalizeExitCode(exitCode),
  };
}

async function runGit(rootPath: string, args: string[]) {
  return runCommand('git', ['-C', rootPath, ...args], rootPath);
}

async function runGitOrThrow(rootPath: string, args: string[]) {
  const result = await runGit(rootPath, args);
  if (result.exitCode !== 0) {
    const detail =
      result.stderr.trim() || result.stdout.trim() || args.join(' ');
    throw new Error(detail);
  }

  return result.stdout.trim();
}

function trimNullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumstatValue(value: string) {
  if (value === '-' || value.trim() === '') {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern: string) {
  const normalized = pattern.replace(/\\/g, '/');
  let source = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];

    if (current === '*') {
      if (next === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (current === '?') {
      source += '[^/]';
      continue;
    }

    if (current === '/') {
      source += '/';
      continue;
    }

    source += escapeRegex(current);
  }

  source += '$';
  return new RegExp(source);
}

function matchesAny(path: string, patterns: readonly string[]) {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function shouldIncludePath(
  relativePath: string,
  includePatterns: readonly string[],
  excludePatterns: readonly string[]
) {
  const normalized = relativePath.replace(/\\/g, '/');
  const included =
    includePatterns.length === 0 || matchesAny(normalized, includePatterns);
  if (!included) {
    return false;
  }

  return !matchesAny(normalized, excludePatterns);
}

function parseNumstat(
  output: string,
  includePatterns: readonly string[],
  excludePatterns: readonly string[]
) {
  const touchedPaths: GitTouchedPath[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [additionsRaw = '0', deletionsRaw = '0', ...pathParts] =
      line.split('\t');
    const relativePath = pathParts.join('\t').trim();
    if (!relativePath) {
      continue;
    }

    if (!shouldIncludePath(relativePath, includePatterns, excludePatterns)) {
      continue;
    }

    touchedPaths.push({
      path: relativePath,
      additions: normalizeNumstatValue(additionsRaw),
      deletions: normalizeNumstatValue(deletionsRaw),
    });
  }

  return touchedPaths;
}

function summarizeTouchedPaths(paths: readonly GitTouchedPath[]) {
  return paths.reduce(
    (summary, path) => ({
      additions: summary.additions + path.additions,
      deletions: summary.deletions + path.deletions,
      fileCount: summary.fileCount + 1,
    }),
    {
      additions: 0,
      deletions: 0,
      fileCount: 0,
    }
  );
}

function mergeTouchedPaths(
  ...groups: ReadonlyArray<readonly GitTouchedPath[]>
): GitTouchedPath[] {
  const merged = new Map<string, GitTouchedPath>();

  for (const group of groups) {
    for (const path of group) {
      const existing = merged.get(path.path);
      if (existing) {
        existing.additions += path.additions;
        existing.deletions += path.deletions;
        continue;
      }

      merged.set(path.path, { ...path });
    }
  }

  return [...merged.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function discoverRepositoryRoots(
  rootPath: string,
  maxDepth: number,
  seen: Set<string>
): Promise<string[]> {
  const absoluteRoot = resolve(rootPath);
  if (seen.has(absoluteRoot)) {
    return [];
  }
  seen.add(absoluteRoot);

  if (await pathExists(`${absoluteRoot}/.git`)) {
    return [absoluteRoot];
  }

  if (maxDepth <= 0) {
    return [];
  }

  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const discovered: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }

    discovered.push(
      ...(await discoverRepositoryRoots(
        `${absoluteRoot}/${entry.name}`,
        maxDepth - 1,
        seen
      ))
    );
  }

  return discovered;
}

async function computeDirectorySize(rootPath: string): Promise<number> {
  let total = 0;
  const entries = await readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git') {
      continue;
    }

    const nextPath = `${rootPath}/${entry.name}`;
    if (entry.isDirectory()) {
      total += await computeDirectorySize(nextPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const info = await stat(nextPath);
    total += info.size;
  }

  return total;
}

const extensionLanguageMap: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.json': 'JSON',
  '.go': 'Go',
  '.py': 'Python',
  '.sql': 'SQL',
  '.md': 'Markdown',
  '.vue': 'Vue',
  '.astro': 'Astro',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.sh': 'Shell',
};

function inferLanguage(path: string) {
  const dot = path.lastIndexOf('.');
  if (dot < 0) {
    return 'Other';
  }

  return extensionLanguageMap[path.slice(dot).toLowerCase()] ?? 'Other';
}

async function buildLanguageBreakdown(
  rootPath: string,
  includePatterns: readonly string[],
  excludePatterns: readonly string[]
): Promise<LanguageStat[]> {
  const counts = new Map<string, number>();

  async function walk(currentPath: string, relativePrefix = ''): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const absolute = `${currentPath}/${entry.name}`;
      const relative = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!shouldIncludePath(relative, includePatterns, excludePatterns)) {
        continue;
      }

      const language = inferLanguage(relative);
      const current = counts.get(language) ?? 0;
      counts.set(language, current + 1);
    }
  }

  await walk(rootPath);

  return [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .map(([language, fileCount]) => ({
      language,
      code: fileCount,
      comments: 0,
      blanks: 0,
    }));
}

function extractBranchFromDecorations(decorations: string) {
  const normalized = decorations.trim();
  if (!normalized) {
    return null;
  }

  for (const token of normalized.split(',')) {
    const trimmed = token.trim();
    if (trimmed === 'HEAD') {
      continue;
    }

    if (trimmed.startsWith('HEAD -> ')) {
      return trimmed.slice('HEAD -> '.length);
    }

    if (!trimmed.includes('/')) {
      return trimmed;
    }
  }

  return null;
}

export function createShellGitBackend(): GitBackend {
  return {
    async discoverRepositories(rootPath, maxDepth) {
      const seen = new Set<string>();
      const roots = await discoverRepositoryRoots(rootPath, maxDepth, seen);
      return [...new Set(roots)].sort((left, right) =>
        left.localeCompare(right)
      );
    },

    async probeRepository(rootPath) {
      const [remoteResult, defaultBranchResult, currentBranchResult] =
        await Promise.all([
          runGit(rootPath, ['remote', 'get-url', 'origin']),
          runGit(rootPath, [
            'symbolic-ref',
            '--short',
            'refs/remotes/origin/HEAD',
          ]),
          runGit(rootPath, ['symbolic-ref', '--short', 'HEAD']),
        ]);

      const remoteUrl =
        remoteResult.exitCode === 0 ? trimNullable(remoteResult.stdout) : null;
      const originHead =
        defaultBranchResult.exitCode === 0
          ? trimNullable(defaultBranchResult.stdout)?.replace(/^origin\//, '')
          : null;
      const currentBranch =
        currentBranchResult.exitCode === 0
          ? trimNullable(currentBranchResult.stdout)
          : null;

      return {
        name: basename(rootPath),
        remoteUrl,
        defaultBranch: originHead ?? currentBranch,
      };
    },

    async snapshotRepository(rootPath, options = {}) {
      const includePatterns = [...(options.includePatterns ?? [])];
      const excludePatterns = [...(options.excludePatterns ?? [])];

      const [
        branchResult,
        headResult,
        upstreamResult,
        liveResult,
        stagedResult,
      ] = await Promise.all([
        runGit(rootPath, ['symbolic-ref', '--short', '-q', 'HEAD']),
        runGit(rootPath, ['rev-parse', 'HEAD']),
        runGit(rootPath, [
          'rev-parse',
          '--abbrev-ref',
          '--symbolic-full-name',
          '@{up}',
        ]),
        runGit(rootPath, ['diff', '--numstat', '--no-renames']),
        runGit(rootPath, ['diff', '--cached', '--numstat', '--no-renames']),
      ]);

      const branch =
        branchResult.exitCode === 0 ? trimNullable(branchResult.stdout) : null;
      const upstreamRef =
        upstreamResult.exitCode === 0
          ? trimNullable(upstreamResult.stdout)
          : null;
      const [upstreamHeadResult, aheadBehindResult] = await Promise.all([
        upstreamRef
          ? runGit(rootPath, ['rev-parse', '@{up}'])
          : Promise.resolve({ stdout: '', stderr: '', exitCode: 1 }),
        upstreamRef
          ? runGit(rootPath, [
              'rev-list',
              '--left-right',
              '--count',
              `${upstreamRef}...HEAD`,
            ])
          : Promise.resolve({ stdout: '', stderr: '', exitCode: 1 }),
      ]);

      const liveTouchedPaths = parseNumstat(
        liveResult.stdout,
        includePatterns,
        excludePatterns
      );
      const stagedTouchedPaths = parseNumstat(
        stagedResult.stdout,
        includePatterns,
        excludePatterns
      );
      const touchedPaths = mergeTouchedPaths(
        liveTouchedPaths,
        stagedTouchedPaths
      );
      const liveStats = summarizeTouchedPaths(liveTouchedPaths);
      const stagedStats = summarizeTouchedPaths(stagedTouchedPaths);

      let aheadCount = 0;
      let behindCount = 0;
      if (aheadBehindResult.exitCode === 0) {
        const [behindRaw = '0', aheadRaw = '0'] = aheadBehindResult.stdout
          .trim()
          .split(/\s+/);
        behindCount = Number.parseInt(behindRaw, 10) || 0;
        aheadCount = Number.parseInt(aheadRaw, 10) || 0;
      }

      return {
        branch,
        isDetached: branch == null,
        headSha:
          headResult.exitCode === 0 ? trimNullable(headResult.stdout) : null,
        upstreamRef,
        upstreamHeadSha:
          upstreamHeadResult.exitCode === 0
            ? trimNullable(upstreamHeadResult.stdout)
            : null,
        aheadCount,
        behindCount,
        liveStats,
        stagedStats,
        touchedPaths,
        repoSizeBytes: options.includeSizeScan
          ? await computeDirectorySize(rootPath)
          : 0,
        languageBreakdown: options.includeSizeScan
          ? await buildLanguageBreakdown(
              rootPath,
              includePatterns,
              excludePatterns
            )
          : [],
      };
    },

    async importHistory(rootPath, options) {
      const includePatterns = [...(options.includePatterns ?? [])];
      const excludePatterns = [...(options.excludePatterns ?? [])];
      const authorEmails = new Set(
        (options.authorEmails ?? []).map((email) => email.trim().toLowerCase())
      );
      const now = new Date();
      const since = new Date(
        now.getTime() - Math.max(1, options.days) * 24 * 60 * 60 * 1000
      ).toISOString();
      const output = await runGitOrThrow(rootPath, [
        'log',
        '--all',
        '--date=iso-strict',
        '--no-renames',
        `--since=${since}`,
        '--pretty=format:%x1e%H%x1f%aI%x1f%an%x1f%ae%x1f%s%x1f%D%x1f%P',
        '--numstat',
      ]);

      const commits: ImportedHistoryCommit[] = [];
      for (const chunk of output.split('\x1e')) {
        const record = chunk.trim();
        if (!record) {
          continue;
        }

        const [headerLine = '', ...numstatLines] = record.split(/\r?\n/);
        const [
          commitSha,
          authoredAtRaw,
          authorNameRaw,
          authorEmailRaw,
          summaryRaw,
          decorationsRaw,
          parentsRaw = '',
        ] = headerLine.split('\x1f');

        const authorEmail = trimNullable(authorEmailRaw)?.toLowerCase() ?? null;
        if (
          authorEmails.size > 0 &&
          (!authorEmail || !authorEmails.has(authorEmail))
        ) {
          continue;
        }

        const touchedPaths = parseNumstat(
          numstatLines.join('\n'),
          includePatterns,
          excludePatterns
        );
        const totals = summarizeTouchedPaths(touchedPaths);
        const parentCount = parentsRaw
          .trim()
          .split(/\s+/)
          .filter((value) => value.length > 0).length;

        commits.push({
          commitSha,
          authoredAt: new Date(authoredAtRaw),
          authorName: trimNullable(authorNameRaw),
          authorEmail,
          summary: summaryRaw.trim(),
          branch: extractBranchFromDecorations(decorationsRaw),
          additions: totals.additions,
          deletions: totals.deletions,
          filesChanged: totals.fileCount,
          isMerge: parentCount > 1,
          touchedPaths,
        });
      }

      return commits;
    },
  };
}
