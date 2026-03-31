export const trackedTargetKinds = ['repo', 'folder'] as const;
export const repositoryStates = ['active', 'disabled', 'removed'] as const;
export const pushKinds = [
  'push_detected_local',
  'push_remote_confirmed',
] as const;
export const activityKinds = [
  'refresh',
  'import',
  'commit',
  'push',
  'manual_rescan',
] as const;

export type TrackedTargetKind = (typeof trackedTargetKinds)[number];
export type RepositoryState = (typeof repositoryStates)[number];
export type PushKind = (typeof pushKinds)[number];
export type ActivityKind = (typeof activityKinds)[number];

export interface LanguageStat {
  language: string;
  code: number;
  comments: number;
  blanks: number;
}

export interface TrackedTarget {
  id: string;
  path: string;
  kind: TrackedTargetKind;
  createdAt: Date;
  lastScanAt: Date | null;
}

export interface Repository {
  id: string;
  targetId: string | null;
  name: string;
  rootPath: string;
  remoteUrl: string | null;
  defaultBranch: string | null;
  includePatterns: string[];
  excludePatterns: string[];
  isMonitored: boolean;
  state: RepositoryState;
  createdAt: Date;
  updatedAt: Date;
  lastError: string | null;
}

export interface RepoStatusSnapshot {
  id: string;
  repoId: string;
  observedAt: Date;
  branch: string | null;
  isDetached: boolean;
  headSha: string | null;
  upstreamRef: string | null;
  upstreamHeadSha: string | null;
  aheadCount: number;
  behindCount: number;
  liveAdditions: number;
  liveDeletions: number;
  liveFiles: number;
  stagedAdditions: number;
  stagedDeletions: number;
  stagedFiles: number;
  filesTouched: number;
  repoSizeBytes: number;
  languageBreakdown: LanguageStat[];
}

export interface FileActivityEvent {
  id: string;
  repoId: string;
  observedAt: Date;
  relativePath: string;
  additions: number;
  deletions: number;
  kind: ActivityKind;
}

export interface CommitEvent {
  id: string;
  repoId: string;
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
  importedAt: Date;
}

export interface PushEvent {
  id: string;
  repoId: string;
  observedAt: Date;
  kind: PushKind;
  headSha: string | null;
  pushedCommitCount: number;
  upstreamRef: string | null;
  notes: string | null;
}

export interface FocusSession {
  id: string;
  startedAt: Date;
  endedAt: Date;
  activeMinutes: number;
  repoIds: string[];
  eventCount: number;
  totalChangedLines: number;
}

export interface DailyRollup {
  scope: string;
  day: string;
  liveAdditions: number;
  liveDeletions: number;
  stagedAdditions: number;
  stagedDeletions: number;
  committedAdditions: number;
  committedDeletions: number;
  commits: number;
  pushes: number;
  focusMinutes: number;
  filesTouched: number;
  languagesTouched: number;
  score: number;
}

export interface Achievement {
  kind: string;
  unlockedAt: Date;
  day: string | null;
  reason: string;
}

export interface SettingRecord {
  key: string;
  valueJson: unknown;
  updatedAt: Date;
}

export interface ActivityFeedItem {
  kind: 'commit' | 'push' | 'file_change';
  repoName: string;
  timestamp: Date;
  detail: string;
}
