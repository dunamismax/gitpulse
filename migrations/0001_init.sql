CREATE TABLE IF NOT EXISTS tracked_targets (
    id UUID PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    created_at_utc TIMESTAMPTZ NOT NULL,
    last_scan_at_utc TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY NOT NULL,
    target_id UUID,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    remote_url TEXT,
    default_branch TEXT,
    include_patterns_json TEXT NOT NULL DEFAULT '[]',
    exclude_patterns_json TEXT NOT NULL DEFAULT '[]',
    is_monitored BOOLEAN NOT NULL DEFAULT TRUE,
    state TEXT NOT NULL DEFAULT 'active',
    created_at_utc TIMESTAMPTZ NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL,
    last_error TEXT,
    FOREIGN KEY (target_id) REFERENCES tracked_targets(id)
);

CREATE TABLE IF NOT EXISTS repo_status_snapshots (
    id UUID PRIMARY KEY NOT NULL,
    repo_id UUID NOT NULL,
    observed_at_utc TIMESTAMPTZ NOT NULL,
    branch TEXT,
    is_detached BOOLEAN NOT NULL DEFAULT FALSE,
    head_sha TEXT,
    upstream_ref TEXT,
    upstream_head_sha TEXT,
    ahead_count BIGINT NOT NULL DEFAULT 0,
    behind_count BIGINT NOT NULL DEFAULT 0,
    live_additions BIGINT NOT NULL DEFAULT 0,
    live_deletions BIGINT NOT NULL DEFAULT 0,
    live_files BIGINT NOT NULL DEFAULT 0,
    staged_additions BIGINT NOT NULL DEFAULT 0,
    staged_deletions BIGINT NOT NULL DEFAULT 0,
    staged_files BIGINT NOT NULL DEFAULT 0,
    files_touched BIGINT NOT NULL DEFAULT 0,
    repo_size_bytes BIGINT NOT NULL DEFAULT 0,
    language_breakdown_json TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (repo_id) REFERENCES repositories(id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_repo_observed_at ON repo_status_snapshots(repo_id, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS file_activity_events (
    id UUID PRIMARY KEY NOT NULL,
    repo_id UUID NOT NULL,
    observed_at_utc TIMESTAMPTZ NOT NULL,
    relative_path TEXT NOT NULL,
    additions BIGINT NOT NULL DEFAULT 0,
    deletions BIGINT NOT NULL DEFAULT 0,
    kind TEXT NOT NULL,
    FOREIGN KEY (repo_id) REFERENCES repositories(id)
);
CREATE INDEX IF NOT EXISTS idx_file_events_repo_observed_at ON file_activity_events(repo_id, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS commit_events (
    id UUID PRIMARY KEY NOT NULL,
    repo_id UUID NOT NULL,
    commit_sha TEXT NOT NULL,
    authored_at_utc TIMESTAMPTZ NOT NULL,
    author_name TEXT,
    author_email TEXT,
    summary TEXT NOT NULL,
    branch TEXT,
    additions BIGINT NOT NULL DEFAULT 0,
    deletions BIGINT NOT NULL DEFAULT 0,
    files_changed BIGINT NOT NULL DEFAULT 0,
    is_merge BOOLEAN NOT NULL DEFAULT FALSE,
    imported_at_utc TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (repo_id) REFERENCES repositories(id),
    UNIQUE(repo_id, commit_sha)
);
CREATE INDEX IF NOT EXISTS idx_commit_events_repo_authored_at ON commit_events(repo_id, authored_at_utc DESC);

CREATE TABLE IF NOT EXISTS push_events (
    id UUID PRIMARY KEY NOT NULL,
    repo_id UUID NOT NULL,
    observed_at_utc TIMESTAMPTZ NOT NULL,
    kind TEXT NOT NULL,
    head_sha TEXT,
    pushed_commit_count BIGINT NOT NULL DEFAULT 0,
    upstream_ref TEXT,
    notes TEXT,
    FOREIGN KEY (repo_id) REFERENCES repositories(id)
);
CREATE INDEX IF NOT EXISTS idx_push_events_repo_observed_at ON push_events(repo_id, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS focus_sessions (
    id UUID PRIMARY KEY NOT NULL,
    started_at_utc TIMESTAMPTZ NOT NULL,
    ended_at_utc TIMESTAMPTZ NOT NULL,
    active_minutes BIGINT NOT NULL DEFAULT 0,
    repo_ids_json TEXT NOT NULL,
    event_count BIGINT NOT NULL DEFAULT 0,
    total_changed_lines BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at ON focus_sessions(started_at_utc DESC);

CREATE TABLE IF NOT EXISTS daily_rollups (
    scope TEXT NOT NULL,
    day DATE NOT NULL,
    live_additions BIGINT NOT NULL DEFAULT 0,
    live_deletions BIGINT NOT NULL DEFAULT 0,
    staged_additions BIGINT NOT NULL DEFAULT 0,
    staged_deletions BIGINT NOT NULL DEFAULT 0,
    committed_additions BIGINT NOT NULL DEFAULT 0,
    committed_deletions BIGINT NOT NULL DEFAULT 0,
    commits BIGINT NOT NULL DEFAULT 0,
    pushes BIGINT NOT NULL DEFAULT 0,
    focus_minutes BIGINT NOT NULL DEFAULT 0,
    files_touched BIGINT NOT NULL DEFAULT 0,
    languages_touched BIGINT NOT NULL DEFAULT 0,
    score BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_rollups_day ON daily_rollups(day DESC);

CREATE TABLE IF NOT EXISTS achievements (
    kind TEXT PRIMARY KEY NOT NULL,
    unlocked_at_utc TIMESTAMPTZ NOT NULL,
    day DATE,
    reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL
);
