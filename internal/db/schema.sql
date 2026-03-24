-- GitPulse SQLite schema - v1
-- Timestamps are stored as RFC3339 UTC text.
-- JSON payloads are stored as text.

CREATE TABLE IF NOT EXISTS tracked_targets (
    id               TEXT PRIMARY KEY NOT NULL,
    path             TEXT NOT NULL UNIQUE,
    kind             TEXT NOT NULL CHECK (kind IN ('repo', 'folder')),
    created_at_utc   TEXT NOT NULL,
    last_scan_at_utc TEXT
);

CREATE TABLE IF NOT EXISTS repositories (
    id               TEXT PRIMARY KEY NOT NULL,
    target_id        TEXT REFERENCES tracked_targets(id),
    name             TEXT NOT NULL,
    root_path        TEXT NOT NULL UNIQUE,
    remote_url       TEXT,
    default_branch   TEXT,
    include_patterns TEXT NOT NULL DEFAULT '[]',
    exclude_patterns TEXT NOT NULL DEFAULT '[]',
    is_monitored     INTEGER NOT NULL DEFAULT 1,
    state            TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disabled', 'removed')),
    created_at_utc   TEXT NOT NULL,
    updated_at_utc   TEXT NOT NULL,
    last_error       TEXT
);

CREATE TABLE IF NOT EXISTS repo_status_snapshots (
    id                 TEXT PRIMARY KEY NOT NULL,
    repo_id            TEXT NOT NULL REFERENCES repositories(id),
    observed_at_utc    TEXT NOT NULL,
    branch             TEXT,
    is_detached        INTEGER NOT NULL DEFAULT 0,
    head_sha           TEXT,
    upstream_ref       TEXT,
    upstream_head_sha  TEXT,
    ahead_count        INTEGER NOT NULL DEFAULT 0,
    behind_count       INTEGER NOT NULL DEFAULT 0,
    live_additions     INTEGER NOT NULL DEFAULT 0,
    live_deletions     INTEGER NOT NULL DEFAULT 0,
    live_files         INTEGER NOT NULL DEFAULT 0,
    staged_additions   INTEGER NOT NULL DEFAULT 0,
    staged_deletions   INTEGER NOT NULL DEFAULT 0,
    staged_files       INTEGER NOT NULL DEFAULT 0,
    files_touched      INTEGER NOT NULL DEFAULT 0,
    repo_size_bytes    INTEGER NOT NULL DEFAULT 0,
    language_breakdown TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_snapshots_repo_observed_at
    ON repo_status_snapshots(repo_id, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS file_activity_events (
    id              TEXT PRIMARY KEY NOT NULL,
    repo_id         TEXT NOT NULL REFERENCES repositories(id),
    observed_at_utc TEXT NOT NULL,
    relative_path   TEXT NOT NULL,
    additions       INTEGER NOT NULL DEFAULT 0,
    deletions       INTEGER NOT NULL DEFAULT 0,
    kind            TEXT NOT NULL CHECK (kind IN ('refresh', 'import', 'commit', 'push', 'manual_rescan'))
);
CREATE INDEX IF NOT EXISTS idx_file_events_repo_observed_at
    ON file_activity_events(repo_id, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS commit_events (
    id              TEXT PRIMARY KEY NOT NULL,
    repo_id         TEXT NOT NULL REFERENCES repositories(id),
    commit_sha      TEXT NOT NULL,
    authored_at_utc TEXT NOT NULL,
    author_name     TEXT,
    author_email    TEXT,
    summary         TEXT NOT NULL,
    branch          TEXT,
    additions       INTEGER NOT NULL DEFAULT 0,
    deletions       INTEGER NOT NULL DEFAULT 0,
    files_changed   INTEGER NOT NULL DEFAULT 0,
    is_merge        INTEGER NOT NULL DEFAULT 0,
    imported_at_utc TEXT NOT NULL,
    UNIQUE (repo_id, commit_sha)
);
CREATE INDEX IF NOT EXISTS idx_commit_events_repo_authored_at
    ON commit_events(repo_id, authored_at_utc DESC);

CREATE TABLE IF NOT EXISTS push_events (
    id                  TEXT PRIMARY KEY NOT NULL,
    repo_id             TEXT NOT NULL REFERENCES repositories(id),
    observed_at_utc     TEXT NOT NULL,
    kind                TEXT NOT NULL CHECK (kind IN ('push_detected_local', 'push_remote_confirmed')),
    head_sha            TEXT,
    pushed_commit_count INTEGER NOT NULL DEFAULT 0,
    upstream_ref        TEXT,
    notes               TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_events_repo_observed_at
    ON push_events(repo_id, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS focus_sessions (
    id                  TEXT PRIMARY KEY NOT NULL,
    started_at_utc      TEXT NOT NULL,
    ended_at_utc        TEXT NOT NULL,
    active_minutes      INTEGER NOT NULL DEFAULT 0,
    repo_ids            TEXT NOT NULL DEFAULT '[]',
    event_count         INTEGER NOT NULL DEFAULT 0,
    total_changed_lines INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at
    ON focus_sessions(started_at_utc DESC);

CREATE TABLE IF NOT EXISTS daily_rollups (
    scope               TEXT NOT NULL,
    day                 TEXT NOT NULL,
    live_additions      INTEGER NOT NULL DEFAULT 0,
    live_deletions      INTEGER NOT NULL DEFAULT 0,
    staged_additions    INTEGER NOT NULL DEFAULT 0,
    staged_deletions    INTEGER NOT NULL DEFAULT 0,
    committed_additions INTEGER NOT NULL DEFAULT 0,
    committed_deletions INTEGER NOT NULL DEFAULT 0,
    commits             INTEGER NOT NULL DEFAULT 0,
    pushes              INTEGER NOT NULL DEFAULT 0,
    focus_minutes       INTEGER NOT NULL DEFAULT 0,
    files_touched       INTEGER NOT NULL DEFAULT 0,
    languages_touched   INTEGER NOT NULL DEFAULT 0,
    score               INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_rollups_day
    ON daily_rollups(day DESC);

CREATE TABLE IF NOT EXISTS achievements (
    kind            TEXT PRIMARY KEY NOT NULL,
    unlocked_at_utc TEXT NOT NULL,
    day             TEXT,
    reason          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key            TEXT PRIMARY KEY NOT NULL,
    value_json     TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
);
