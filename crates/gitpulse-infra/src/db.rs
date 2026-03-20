use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, Utc};
use gitpulse_core::{
    AchievementAward, AppSettings, CommitEvent, DailyRollup, DiffStats, FocusSession, PushEvent,
    PushEventKind, RepoStatusSnapshot, Repository, RepositoryState,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use tracing::info;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct DatabasePaths {
    pub file: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PersistedFileTouch {
    pub path: String,
    pub touches: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PersistedAchievement {
    pub kind: String,
    pub unlocked_at_utc: DateTime<Utc>,
    pub day: Option<NaiveDate>,
    pub reason: String,
}

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn connect(paths: &DatabasePaths) -> Result<Self> {
        if let Some(parent) = paths.file.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let options = SqliteConnectOptions::new().filename(&paths.file).create_if_missing(true);
        let pool =
            SqlitePoolOptions::new().max_connections(8).connect_with(options).await.with_context(
                || format!("failed to connect to database at {}", paths.file.display()),
            )?;

        sqlx::query("PRAGMA journal_mode = WAL;").execute(&pool).await?;
        sqlx::query("PRAGMA synchronous = NORMAL;").execute(&pool).await?;
        sqlx::query("PRAGMA foreign_keys = ON;").execute(&pool).await?;

        let migration_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../migrations");
        sqlx::migrate::Migrator::new(migration_root.as_path()).await?.run(&pool).await?;

        info!(database = %paths.file.display(), "database ready");
        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn load_settings(&self) -> Result<AppSettings> {
        self.load_json_setting("app_settings").await.map(|value| value.unwrap_or_default())
    }

    pub async fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        self.save_json_setting("app_settings", settings).await
    }

    pub async fn save_json_setting<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let value_json = serde_json::to_string(value)?;
        sqlx::query(
            "INSERT INTO settings (key, value_json, updated_at_utc)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at_utc = excluded.updated_at_utc",
        )
        .bind(key)
        .bind(value_json)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn load_json_setting<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let row = sqlx::query("SELECT value_json FROM settings WHERE key = ?1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        row.map(|row| {
            serde_json::from_str::<T>(row.get::<String, _>("value_json").as_str())
                .map_err(Into::into)
        })
        .transpose()
    }

    pub async fn add_tracked_target(&self, path: &str, kind: &str) -> Result<Uuid> {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO tracked_targets (id, path, kind, created_at_utc)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET kind = excluded.kind",
        )
        .bind(id)
        .bind(path)
        .bind(kind)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;

        let existing_id = sqlx::query("SELECT id FROM tracked_targets WHERE path = ?1")
            .bind(path)
            .fetch_one(&self.pool)
            .await?
            .get::<Uuid, _>("id");
        Ok(existing_id)
    }

    pub async fn mark_target_scanned(&self, target_id: Uuid) -> Result<()> {
        sqlx::query("UPDATE tracked_targets SET last_scan_at_utc = ?2 WHERE id = ?1")
            .bind(target_id)
            .bind(Utc::now())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn upsert_repository(
        &self,
        target_id: Option<Uuid>,
        name: &str,
        root_path: &str,
        remote_url: Option<&str>,
        default_branch: Option<&str>,
    ) -> Result<Repository> {
        let now = Utc::now();
        let repo_id = sqlx::query("SELECT id FROM repositories WHERE root_path = ?1")
            .bind(root_path)
            .fetch_optional(&self.pool)
            .await?
            .map(|row| row.get::<Uuid, _>("id"))
            .unwrap_or_else(Uuid::new_v4);

        sqlx::query(
            "INSERT INTO repositories (
                id, target_id, name, root_path, remote_url, default_branch, created_at_utc, updated_at_utc, state
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active')
             ON CONFLICT(root_path) DO UPDATE SET
                target_id = excluded.target_id,
                name = excluded.name,
                remote_url = excluded.remote_url,
                default_branch = excluded.default_branch,
                updated_at_utc = excluded.updated_at_utc,
                state = 'active'",
        )
        .bind(repo_id)
        .bind(target_id)
        .bind(name)
        .bind(root_path)
        .bind(remote_url)
        .bind(default_branch)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        self.get_repository(repo_id).await
    }

    pub async fn list_repositories(&self) -> Result<Vec<Repository>> {
        let rows = sqlx::query(
            "SELECT id, name, root_path, remote_url, default_branch, is_monitored, state, created_at_utc, updated_at_utc, last_error
             FROM repositories ORDER BY name ASC",
        )
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_repository_row).collect()
    }

    pub async fn get_repository(&self, repo_id: Uuid) -> Result<Repository> {
        let row = sqlx::query(
            "SELECT id, name, root_path, remote_url, default_branch, is_monitored, state, created_at_utc, updated_at_utc, last_error
             FROM repositories WHERE id = ?1",
        )
        .bind(repo_id)
        .fetch_one(&self.pool)
        .await?;
        map_repository_row(row)
    }

    pub async fn find_repository(&self, selector: &str) -> Result<Option<Repository>> {
        let row = sqlx::query(
            "SELECT id, name, root_path, remote_url, default_branch, is_monitored, state, created_at_utc, updated_at_utc, last_error
             FROM repositories WHERE id = ?1 OR name = ?1 OR root_path = ?1 LIMIT 1",
        )
        .bind(selector)
        .fetch_optional(&self.pool)
        .await?;
        row.map(map_repository_row).transpose()
    }

    pub async fn set_repository_state(
        &self,
        repo_id: Uuid,
        state: RepositoryState,
        is_monitored: bool,
    ) -> Result<()> {
        let state = match state {
            RepositoryState::Active => "active",
            RepositoryState::Disabled => "disabled",
            RepositoryState::Removed => "removed",
        };
        sqlx::query(
            "UPDATE repositories
             SET state = ?2, is_monitored = ?3, updated_at_utc = ?4
             WHERE id = ?1",
        )
        .bind(repo_id)
        .bind(state)
        .bind(is_monitored)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn set_repository_patterns(
        &self,
        repo_id: Uuid,
        include: &[String],
        exclude: &[String],
    ) -> Result<()> {
        sqlx::query(
            "UPDATE repositories
             SET include_patterns_json = ?2, exclude_patterns_json = ?3, updated_at_utc = ?4
             WHERE id = ?1",
        )
        .bind(repo_id)
        .bind(serde_json::to_string(include)?)
        .bind(serde_json::to_string(exclude)?)
        .bind(Utc::now())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn repository_patterns(&self, repo_id: Uuid) -> Result<(Vec<String>, Vec<String>)> {
        let row = sqlx::query(
            "SELECT include_patterns_json, exclude_patterns_json FROM repositories WHERE id = ?1",
        )
        .bind(repo_id)
        .fetch_one(&self.pool)
        .await?;
        Ok((
            serde_json::from_str(row.get::<String, _>("include_patterns_json").as_str())?,
            serde_json::from_str(row.get::<String, _>("exclude_patterns_json").as_str())?,
        ))
    }

    pub async fn insert_snapshot(&self, snapshot: &RepoStatusSnapshot) -> Result<()> {
        sqlx::query(
            "INSERT INTO repo_status_snapshots (
                id, repo_id, observed_at_utc, branch, is_detached, head_sha, upstream_ref, upstream_head_sha,
                ahead_count, behind_count, live_additions, live_deletions, live_files, staged_additions,
                staged_deletions, staged_files, files_touched, repo_size_bytes, language_breakdown_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        )
        .bind(snapshot.id)
        .bind(snapshot.repo_id)
        .bind(snapshot.observed_at_utc)
        .bind(snapshot.branch.as_deref())
        .bind(snapshot.is_detached)
        .bind(snapshot.head_sha.as_deref())
        .bind(snapshot.upstream_ref.as_deref())
        .bind(snapshot.upstream_head_sha.as_deref())
        .bind(snapshot.ahead_count)
        .bind(snapshot.behind_count)
        .bind(snapshot.live_stats.additions)
        .bind(snapshot.live_stats.deletions)
        .bind(snapshot.live_stats.file_count)
        .bind(snapshot.staged_stats.additions)
        .bind(snapshot.staged_stats.deletions)
        .bind(snapshot.staged_stats.file_count)
        .bind(snapshot.files_touched)
        .bind(snapshot.repo_size_bytes)
        .bind(&snapshot.language_breakdown_json)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn latest_snapshot(&self, repo_id: Uuid) -> Result<Option<RepoStatusSnapshot>> {
        let row = sqlx::query(
            "SELECT * FROM repo_status_snapshots WHERE repo_id = ?1 ORDER BY observed_at_utc DESC LIMIT 1",
        )
        .bind(repo_id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(map_snapshot_row).transpose()
    }

    pub async fn recent_snapshots(
        &self,
        repo_id: Uuid,
        limit: i64,
    ) -> Result<Vec<RepoStatusSnapshot>> {
        let rows = sqlx::query(
            "SELECT * FROM repo_status_snapshots WHERE repo_id = ?1 ORDER BY observed_at_utc DESC LIMIT ?2",
        )
        .bind(repo_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(map_snapshot_row).collect()
    }

    pub async fn insert_file_activity(
        &self,
        repo_id: Uuid,
        observed_at_utc: DateTime<Utc>,
        entries: &[(String, i64, i64, String)],
    ) -> Result<()> {
        let mut transaction = self.pool.begin().await?;
        for (relative_path, additions, deletions, kind) in entries {
            sqlx::query(
                "INSERT INTO file_activity_events (id, repo_id, observed_at_utc, relative_path, additions, deletions, kind)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(Uuid::new_v4())
            .bind(repo_id)
            .bind(observed_at_utc)
            .bind(relative_path)
            .bind(additions)
            .bind(deletions)
            .bind(kind)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn top_files_touched(
        &self,
        repo_id: Uuid,
        limit: i64,
    ) -> Result<Vec<PersistedFileTouch>> {
        let rows = sqlx::query(
            "SELECT relative_path, COUNT(*) AS touches
             FROM file_activity_events
             WHERE repo_id = ?1
             GROUP BY relative_path
             ORDER BY touches DESC, relative_path ASC
             LIMIT ?2",
        )
        .bind(repo_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| PersistedFileTouch {
                path: row.get("relative_path"),
                touches: row.get("touches"),
            })
            .collect())
    }

    pub async fn recent_activity_feed(
        &self,
        limit: i64,
    ) -> Result<Vec<(String, String, DateTime<Utc>)>> {
        let rows = sqlx::query(
            "SELECT r.name AS repo_name, 'commit' AS kind, c.authored_at_utc AS observed_at
             FROM commit_events c
             JOIN repositories r ON r.id = c.repo_id
             UNION ALL
             SELECT r.name AS repo_name, p.kind AS kind, p.observed_at_utc AS observed_at
             FROM push_events p
             JOIN repositories r ON r.id = p.repo_id
             UNION ALL
             SELECT r.name AS repo_name, 'activity' AS kind, f.observed_at_utc AS observed_at
             FROM file_activity_events f
             JOIN repositories r ON r.id = f.repo_id
             ORDER BY observed_at DESC
             LIMIT ?1",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| (row.get("repo_name"), row.get("kind"), row.get("observed_at")))
            .collect())
    }

    pub async fn insert_commits(&self, commits: &[CommitEvent]) -> Result<u64> {
        let mut inserted = 0_u64;
        let mut transaction = self.pool.begin().await?;
        for commit in commits {
            let result = sqlx::query(
                "INSERT OR IGNORE INTO commit_events (
                    id, repo_id, commit_sha, authored_at_utc, author_name, author_email, summary, branch,
                    additions, deletions, files_changed, is_merge, imported_at_utc
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            )
            .bind(commit.id)
            .bind(commit.repo_id)
            .bind(&commit.commit_sha)
            .bind(commit.authored_at_utc)
            .bind(commit.author_name.as_deref())
            .bind(commit.author_email.as_deref())
            .bind(&commit.summary)
            .bind(commit.branch.as_deref())
            .bind(commit.additions)
            .bind(commit.deletions)
            .bind(commit.files_changed)
            .bind(commit.is_merge)
            .bind(commit.imported_at_utc)
            .execute(&mut *transaction)
            .await?;
            inserted += result.rows_affected();
        }
        transaction.commit().await?;
        Ok(inserted)
    }

    pub async fn list_commits(
        &self,
        repo_id: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<CommitEvent>> {
        let rows = if let Some(repo_id) = repo_id {
            sqlx::query(
                "SELECT * FROM commit_events WHERE repo_id = ?1 ORDER BY authored_at_utc DESC LIMIT ?2",
            )
            .bind(repo_id)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query("SELECT * FROM commit_events ORDER BY authored_at_utc DESC LIMIT ?1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
        };

        rows.into_iter().map(map_commit_row).collect()
    }

    pub async fn insert_push_event(&self, push: &PushEvent) -> Result<()> {
        sqlx::query(
            "INSERT INTO push_events (
                id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(push.id)
        .bind(push.repo_id)
        .bind(push.observed_at_utc)
        .bind(match push.kind {
            PushEventKind::PushDetectedLocal => "push_detected_local",
            PushEventKind::PushRemoteConfirmed => "push_remote_confirmed",
        })
        .bind(push.head_sha.as_deref())
        .bind(push.pushed_commit_count)
        .bind(push.upstream_ref.as_deref())
        .bind(push.notes.as_deref())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_push_events(
        &self,
        repo_id: Option<Uuid>,
        limit: i64,
    ) -> Result<Vec<PushEvent>> {
        let rows = if let Some(repo_id) = repo_id {
            sqlx::query("SELECT * FROM push_events WHERE repo_id = ?1 ORDER BY observed_at_utc DESC LIMIT ?2")
                .bind(repo_id)
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query("SELECT * FROM push_events ORDER BY observed_at_utc DESC LIMIT ?1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
        };
        rows.into_iter().map(map_push_row).collect()
    }

    pub async fn replace_focus_sessions(&self, sessions: &[FocusSession]) -> Result<()> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM focus_sessions").execute(&mut *transaction).await?;
        for session in sessions {
            sqlx::query(
                "INSERT INTO focus_sessions (
                    id, started_at_utc, ended_at_utc, active_minutes, repo_ids_json, event_count, total_changed_lines
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .bind(session.id)
            .bind(session.started_at_utc)
            .bind(session.ended_at_utc)
            .bind(session.active_minutes)
            .bind(serde_json::to_string(&session.repo_ids)?)
            .bind(session.event_count)
            .bind(session.total_changed_lines)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn list_focus_sessions(&self, limit: i64) -> Result<Vec<FocusSession>> {
        let rows =
            sqlx::query("SELECT * FROM focus_sessions ORDER BY started_at_utc DESC LIMIT ?1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await?;
        rows.into_iter().map(map_session_row).collect()
    }

    pub async fn upsert_daily_rollup(&self, rollup: &DailyRollup) -> Result<()> {
        let scope = rollup.repo_id.map(|id| id.to_string()).unwrap_or_else(|| "all".into());
        sqlx::query(
            "INSERT INTO daily_rollups (
                scope, day, live_additions, live_deletions, staged_additions, staged_deletions,
                committed_additions, committed_deletions, commits, pushes, focus_minutes, files_touched,
                languages_touched, score
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(scope, day) DO UPDATE SET
                live_additions = excluded.live_additions,
                live_deletions = excluded.live_deletions,
                staged_additions = excluded.staged_additions,
                staged_deletions = excluded.staged_deletions,
                committed_additions = excluded.committed_additions,
                committed_deletions = excluded.committed_deletions,
                commits = excluded.commits,
                pushes = excluded.pushes,
                focus_minutes = excluded.focus_minutes,
                files_touched = excluded.files_touched,
                languages_touched = excluded.languages_touched,
                score = excluded.score",
        )
        .bind(scope)
        .bind(rollup.day)
        .bind(rollup.live_additions)
        .bind(rollup.live_deletions)
        .bind(rollup.staged_additions)
        .bind(rollup.staged_deletions)
        .bind(rollup.committed_additions)
        .bind(rollup.committed_deletions)
        .bind(rollup.commits)
        .bind(rollup.pushes)
        .bind(rollup.focus_minutes)
        .bind(rollup.files_touched)
        .bind(rollup.languages_touched)
        .bind(rollup.score)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_daily_rollups(
        &self,
        repo_id: Option<Uuid>,
        days: i64,
    ) -> Result<Vec<DailyRollup>> {
        let scope = repo_id.map(|id| id.to_string()).unwrap_or_else(|| "all".into());
        let rows =
            sqlx::query("SELECT * FROM daily_rollups WHERE scope = ?1 ORDER BY day DESC LIMIT ?2")
                .bind(scope)
                .bind(days)
                .fetch_all(&self.pool)
                .await?;
        rows.into_iter().map(map_rollup_row).collect()
    }

    pub async fn replace_achievements(&self, achievements: &[AchievementAward]) -> Result<()> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM achievements").execute(&mut *transaction).await?;
        for achievement in achievements {
            sqlx::query(
                "INSERT INTO achievements (kind, unlocked_at_utc, day, reason) VALUES (?1, ?2, ?3, ?4)",
            )
            .bind(achievement.kind.title())
            .bind(Utc::now())
            .bind(achievement.day)
            .bind(&achievement.reason)
            .execute(&mut *transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    pub async fn list_achievements(&self) -> Result<Vec<PersistedAchievement>> {
        let rows = sqlx::query("SELECT * FROM achievements ORDER BY unlocked_at_utc ASC")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .into_iter()
            .map(|row| PersistedAchievement {
                kind: row.get("kind"),
                unlocked_at_utc: row.get("unlocked_at_utc"),
                day: row.get("day"),
                reason: row.get("reason"),
            })
            .collect())
    }
}

fn map_repository_row(row: sqlx::sqlite::SqliteRow) -> Result<Repository> {
    Ok(Repository {
        id: row.get("id"),
        name: row.get("name"),
        root_path: row.get("root_path"),
        remote_url: row.get("remote_url"),
        default_branch: row.get("default_branch"),
        is_monitored: row.get("is_monitored"),
        state: match row.get::<String, _>("state").as_str() {
            "disabled" => RepositoryState::Disabled,
            "removed" => RepositoryState::Removed,
            _ => RepositoryState::Active,
        },
        created_at_utc: row.get("created_at_utc"),
        updated_at_utc: row.get("updated_at_utc"),
        last_error: row.get("last_error"),
    })
}

fn map_snapshot_row(row: sqlx::sqlite::SqliteRow) -> Result<RepoStatusSnapshot> {
    Ok(RepoStatusSnapshot {
        id: row.get("id"),
        repo_id: row.get("repo_id"),
        observed_at_utc: row.get("observed_at_utc"),
        branch: row.get("branch"),
        is_detached: row.get("is_detached"),
        head_sha: row.get("head_sha"),
        upstream_ref: row.get("upstream_ref"),
        upstream_head_sha: row.get("upstream_head_sha"),
        ahead_count: row.get("ahead_count"),
        behind_count: row.get("behind_count"),
        live_stats: DiffStats {
            additions: row.get("live_additions"),
            deletions: row.get("live_deletions"),
            file_count: row.get("live_files"),
        },
        staged_stats: DiffStats {
            additions: row.get("staged_additions"),
            deletions: row.get("staged_deletions"),
            file_count: row.get("staged_files"),
        },
        files_touched: row.get("files_touched"),
        repo_size_bytes: row.get("repo_size_bytes"),
        language_breakdown_json: row.get("language_breakdown_json"),
    })
}

fn map_commit_row(row: sqlx::sqlite::SqliteRow) -> Result<CommitEvent> {
    Ok(CommitEvent {
        id: row.get("id"),
        repo_id: row.get("repo_id"),
        commit_sha: row.get("commit_sha"),
        authored_at_utc: row.get("authored_at_utc"),
        author_name: row.get("author_name"),
        author_email: row.get("author_email"),
        summary: row.get("summary"),
        branch: row.get("branch"),
        additions: row.get("additions"),
        deletions: row.get("deletions"),
        files_changed: row.get("files_changed"),
        is_merge: row.get("is_merge"),
        imported_at_utc: row.get("imported_at_utc"),
    })
}

fn map_push_row(row: sqlx::sqlite::SqliteRow) -> Result<PushEvent> {
    Ok(PushEvent {
        id: row.get("id"),
        repo_id: row.get("repo_id"),
        observed_at_utc: row.get("observed_at_utc"),
        kind: match row.get::<String, _>("kind").as_str() {
            "push_remote_confirmed" => PushEventKind::PushRemoteConfirmed,
            _ => PushEventKind::PushDetectedLocal,
        },
        head_sha: row.get("head_sha"),
        pushed_commit_count: row.get("pushed_commit_count"),
        upstream_ref: row.get("upstream_ref"),
        notes: row.get("notes"),
    })
}

fn map_session_row(row: sqlx::sqlite::SqliteRow) -> Result<FocusSession> {
    Ok(FocusSession {
        id: row.get("id"),
        started_at_utc: row.get("started_at_utc"),
        ended_at_utc: row.get("ended_at_utc"),
        active_minutes: row.get("active_minutes"),
        repo_ids: serde_json::from_str(row.get::<String, _>("repo_ids_json").as_str())?,
        event_count: row.get("event_count"),
        total_changed_lines: row.get("total_changed_lines"),
    })
}

fn map_rollup_row(row: sqlx::sqlite::SqliteRow) -> Result<DailyRollup> {
    let scope: String = row.get("scope");
    Ok(DailyRollup {
        repo_id: if scope == "all" { None } else { Some(Uuid::parse_str(scope.as_str())?) },
        day: row.get("day"),
        live_additions: row.get("live_additions"),
        live_deletions: row.get("live_deletions"),
        staged_additions: row.get("staged_additions"),
        staged_deletions: row.get("staged_deletions"),
        committed_additions: row.get("committed_additions"),
        committed_deletions: row.get("committed_deletions"),
        commits: row.get("commits"),
        pushes: row.get("pushes"),
        focus_minutes: row.get("focus_minutes"),
        files_touched: row.get("files_touched"),
        languages_touched: row.get("languages_touched"),
        score: row.get("score"),
    })
}
