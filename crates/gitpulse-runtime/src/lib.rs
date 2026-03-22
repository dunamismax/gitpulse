use std::{
    collections::{BTreeMap, HashSet},
    net::{Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, NaiveDate, Utc};
use gitpulse_core::{
    ActivityKind, ActivityPoint, AppSettings, DailyRollup, GoalProgress, PushEvent, PushEventKind,
    RepoCard, RepoDetailView, RepoHealth, RepoPatternSettings, RepoStatusSnapshot, Repository,
    RepositoryMetrics, RepositoryState, SessionSummary, TodaySummary, TrendPoint,
    metrics::{compute_streaks_as_of, evaluate_achievements},
    scoring::ScoreFormula,
    sessionize,
    time::{format_local, rollup_day},
};
use gitpulse_infra::{
    AppConfig, AppPaths, ConfigLoader, Database, DatabasePaths, GitCli, GithubVerifier, PathFilter,
    RefreshSignal, WatcherService,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tokio::{
    sync::{Mutex, RwLock, mpsc},
    task::JoinHandle,
};
use tracing::{error, warn};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityFeedItem {
    pub repo_name: String,
    pub kind: String,
    pub observed_at_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardView {
    pub today: TodaySummary,
    pub activity_feed: Vec<ActivityFeedItem>,
    pub trend: Vec<TrendPoint>,
    pub heatmap: Vec<TrendPoint>,
    pub repo_cards: Vec<RepoCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AchievementsView {
    pub achievements: Vec<gitpulse_infra::PersistedAchievement>,
    pub streak_current: i64,
    pub streak_best: i64,
    pub today_score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsView {
    pub settings: AppSettings,
    pub config_path: String,
    pub data_path: String,
    pub database_path: String,
}

#[derive(Debug, Clone)]
pub struct BootstrapOptions {
    pub port_override: Option<u16>,
    pub start_background_tasks: bool,
}

impl Default for BootstrapOptions {
    fn default() -> Self {
        Self { port_override: None, start_background_tasks: true }
    }
}

#[derive(Clone)]
pub struct GitPulseRuntime {
    inner: Arc<RuntimeInner>,
}

struct RuntimeInner {
    paths: AppPaths,
    db: Database,
    git: GitCli,
    github: GithubVerifier,
    config: RwLock<AppConfig>,
    watcher: Mutex<Option<WatcherService>>,
    refresh_tx: mpsc::UnboundedSender<RefreshSignal>,
    refresh_guard: Mutex<HashSet<Uuid>>,
    background_tasks: Mutex<Vec<JoinHandle<()>>>,
}

impl GitPulseRuntime {
    pub async fn bootstrap(options: BootstrapOptions) -> Result<Self> {
        let paths = AppPaths::discover()?;
        let file_config = ConfigLoader::new(paths.clone()).load()?;
        Self::bootstrap_in(paths, file_config, options).await
    }

    pub async fn bootstrap_in(
        paths: AppPaths,
        file_config: AppConfig,
        options: BootstrapOptions,
    ) -> Result<Self> {
        paths.ensure()?;
        let db = Database::connect(&DatabasePaths { file: paths.database_file.clone() }).await?;
        let mut effective_config = file_config.clone();
        if let Some(db_settings) = db.load_json_setting::<AppSettings>("app_settings").await? {
            effective_config.settings = db_settings;
        } else {
            db.save_settings(&file_config.settings).await?;
        }
        if let Some(port_override) = options.port_override {
            effective_config.server_port = port_override;
        }

        let (refresh_tx, refresh_rx) = mpsc::unbounded_channel();
        let watcher = if options.start_background_tasks {
            Some(WatcherService::new(
                refresh_tx.clone(),
                effective_config.settings.monitoring.watcher_debounce_ms,
            )?)
        } else {
            None
        };

        let runtime = Self {
            inner: Arc::new(RuntimeInner {
                paths,
                db,
                git: GitCli::new(),
                github: GithubVerifier::new(),
                config: RwLock::new(effective_config),
                watcher: Mutex::new(watcher),
                refresh_tx,
                refresh_guard: Mutex::new(HashSet::new()),
                background_tasks: Mutex::new(Vec::new()),
            }),
        };

        runtime.ensure_author_identity().await?;
        runtime.watch_existing_repositories().await?;
        runtime.rebuild_analytics().await?;

        if options.start_background_tasks {
            runtime.start_background_tasks(refresh_rx).await;
            runtime.enqueue_all_active_repositories().await?;
        }

        Ok(runtime)
    }

    pub fn db(&self) -> &Database {
        &self.inner.db
    }

    pub async fn config(&self) -> AppConfig {
        self.inner.config.read().await.clone()
    }

    pub fn paths(&self) -> &AppPaths {
        &self.inner.paths
    }

    pub async fn socket_addr(&self) -> SocketAddr {
        let config = self.inner.config.read().await;
        SocketAddr::from((Ipv4Addr::LOCALHOST, config.server_port))
    }

    pub async fn git_available(&self) -> bool {
        self.inner.git.is_available().await
    }

    pub async fn add_target(&self, path: impl AsRef<Path>) -> Result<Vec<Repository>> {
        let path = normalize_path(path.as_ref())?;
        let settings = self.inner.config.read().await.settings.clone();
        let discoveries = if self.inner.git.resolve_repo_root(&path).await.is_ok() {
            vec![self.inner.git.probe_repository(&path).await?]
        } else {
            self.inner
                .git
                .discover_repositories(&path, settings.monitoring.repo_discovery_depth)
                .await?
        };

        if discoveries.is_empty() {
            return Err(anyhow!("no git repositories found under {}", path.display()));
        }

        let kind = if discoveries.len() == 1 && discoveries[0].root_path == path {
            "repo"
        } else {
            "folder"
        };
        let target_id =
            self.inner.db.add_tracked_target(path.to_string_lossy().as_ref(), kind).await?;

        let mut repositories = Vec::new();
        for discovered in discoveries {
            let repo = self
                .inner
                .db
                .upsert_repository(
                    Some(target_id),
                    &discovered.name,
                    discovered.root_path.to_string_lossy().as_ref(),
                    discovered.remote_url.as_deref(),
                    discovered.default_branch.as_deref(),
                )
                .await?;
            repositories.push(repo.clone());
            self.watch_repository(&repo).await?;
            self.import_repo_history(repo.id, settings.monitoring.import_days).await?;
            self.refresh_repository(repo.id, true).await?;
        }

        self.inner.db.mark_target_scanned(target_id).await?;
        self.rebuild_analytics().await?;
        Ok(repositories)
    }

    pub async fn list_repositories(&self) -> Result<Vec<Repository>> {
        self.inner.db.list_repositories().await
    }

    pub async fn get_repository(&self, selector: &str) -> Result<Option<Repository>> {
        if let Ok(repo_id) = Uuid::parse_str(selector) {
            return self.inner.db.get_repository(repo_id).await.map(Some).or_else(|_| Ok(None));
        }
        self.inner.db.find_repository(selector).await
    }

    pub async fn refresh_repository(&self, repo_id: Uuid, include_size_scan: bool) -> Result<()> {
        let repo = self.inner.db.get_repository(repo_id).await?;
        if repo.state != RepositoryState::Active {
            return Ok(());
        }
        if self.disable_repository_if_root_missing(&repo, "refresh").await? {
            return Ok(());
        }
        let config = self.inner.config.read().await.clone();
        let filter = self.build_filter(repo_id, &config.settings).await?;
        let previous = self.inner.db.latest_snapshot(repo_id).await?;
        let git_snapshot = self
            .inner
            .git
            .snapshot_repository(Path::new(&repo.root_path), &filter, include_size_scan)
            .await
            .with_context(|| format!("failed to snapshot {}", repo.root_path))?;

        let changed_since_previous = previous
            .as_ref()
            .map(|prior| {
                prior.head_sha != git_snapshot.head_sha
                    || prior.ahead_count != git_snapshot.ahead_count
                    || prior.behind_count != git_snapshot.behind_count
                    || prior.live_stats != git_snapshot.live_stats
                    || prior.staged_stats != git_snapshot.staged_stats
            })
            .unwrap_or(true);

        let snapshot = RepoStatusSnapshot {
            id: Uuid::new_v4(),
            repo_id,
            observed_at_utc: Utc::now(),
            branch: git_snapshot.branch.clone(),
            is_detached: git_snapshot.is_detached,
            head_sha: git_snapshot.head_sha.clone(),
            upstream_ref: git_snapshot.upstream_ref.clone(),
            upstream_head_sha: git_snapshot.upstream_head_sha.clone(),
            ahead_count: git_snapshot.ahead_count,
            behind_count: git_snapshot.behind_count,
            live_stats: git_snapshot.live_stats.clone(),
            staged_stats: git_snapshot.staged_stats.clone(),
            files_touched: git_snapshot.touched_paths.len() as i64,
            repo_size_bytes: if include_size_scan {
                git_snapshot.repo_size_bytes
            } else {
                previous.as_ref().map(|entry| entry.repo_size_bytes).unwrap_or(0)
            },
            language_breakdown_json: if include_size_scan {
                serde_json::to_string(&git_snapshot.language_breakdown)?
            } else {
                previous
                    .as_ref()
                    .map(|entry| entry.language_breakdown_json.clone())
                    .unwrap_or_else(|| "[]".into())
            },
        };
        self.inner.db.insert_snapshot(&snapshot).await?;

        if changed_since_previous && !git_snapshot.touched_paths.is_empty() {
            let entries = git_snapshot
                .touched_paths
                .iter()
                .map(|(path, additions, deletions)| {
                    (path.clone(), *additions, *deletions, String::from("refresh"))
                })
                .collect::<Vec<_>>();
            self.inner.db.insert_file_activity(repo_id, snapshot.observed_at_utc, &entries).await?;
        }

        if let Some(previous) = previous
            && previous.ahead_count > snapshot.ahead_count
        {
            let push = PushEvent {
                id: Uuid::new_v4(),
                repo_id,
                observed_at_utc: Utc::now(),
                kind: PushEventKind::PushDetectedLocal,
                head_sha: snapshot.head_sha.clone(),
                pushed_commit_count: previous.ahead_count - snapshot.ahead_count,
                upstream_ref: snapshot.upstream_ref.clone(),
                notes: Some("Ahead count decreased compared with prior snapshot.".into()),
            };
            self.inner.db.insert_push_event(&push).await?;
            self.verify_remote_push(&repo, &push).await?;
        }

        self.import_repo_history(repo_id, 2).await?;
        self.rebuild_analytics().await?;
        Ok(())
    }

    pub async fn import_repo_history(&self, repo_id: Uuid, days: i64) -> Result<u64> {
        let repo = self.inner.db.get_repository(repo_id).await?;
        if repo.state != RepositoryState::Active {
            return Ok(0);
        }
        if self.disable_repository_if_root_missing(&repo, "import").await? {
            return Ok(0);
        }
        let config = self.inner.config.read().await.clone();
        let filter = self.build_filter(repo_id, &config.settings).await?;
        let imported = self
            .inner
            .git
            .import_history(
                repo_id,
                Path::new(&repo.root_path),
                &config.settings.author_emails(),
                days,
                &filter,
            )
            .await?;
        let inserted_commit_shas = self
            .inner
            .db
            .insert_commits(&imported.iter().map(|entry| entry.commit.clone()).collect::<Vec<_>>())
            .await?
            .into_iter()
            .collect::<HashSet<_>>();
        for item in imported {
            if item.touched_paths.is_empty()
                || !inserted_commit_shas.contains(&item.commit.commit_sha)
            {
                continue;
            }
            let entries = item
                .touched_paths
                .into_iter()
                .map(|(path, additions, deletions)| {
                    (path, additions, deletions, String::from("import"))
                })
                .collect::<Vec<_>>();
            self.inner
                .db
                .insert_file_activity(repo_id, item.commit.authored_at_utc, &entries)
                .await?;
        }
        Ok(inserted_commit_shas.len() as u64)
    }

    pub async fn rescan_all(&self) -> Result<()> {
        for repo in self.inner.db.list_repositories().await? {
            if repo.state == RepositoryState::Active && repo.is_monitored {
                self.refresh_repository(repo.id, true).await?;
            }
        }
        Ok(())
    }

    pub async fn rescan_repository(&self, selector: &str) -> Result<()> {
        let repo = self
            .get_repository(selector)
            .await?
            .ok_or_else(|| anyhow!("repository not found: {selector}"))?;
        self.refresh_repository(repo.id, true).await
    }

    pub async fn toggle_repository(&self, selector: &str) -> Result<()> {
        let repo = self
            .get_repository(selector)
            .await?
            .ok_or_else(|| anyhow!("repository not found: {selector}"))?;
        match repo.state {
            RepositoryState::Active => {
                self.inner
                    .db
                    .set_repository_state(repo.id, RepositoryState::Disabled, false)
                    .await?;
            }
            RepositoryState::Disabled | RepositoryState::Removed => {
                self.inner.db.set_repository_state(repo.id, RepositoryState::Active, true).await?;
                let repo = self.inner.db.get_repository(repo.id).await?;
                self.watch_repository(&repo).await?;
                self.enqueue_refresh(repo.id).await;
            }
        }
        Ok(())
    }

    pub async fn remove_repository(&self, selector: &str) -> Result<()> {
        let repo = self
            .get_repository(selector)
            .await?
            .ok_or_else(|| anyhow!("repository not found: {selector}"))?;
        self.inner.db.set_repository_state(repo.id, RepositoryState::Removed, false).await?;
        self.rebuild_analytics().await
    }

    pub async fn import_all(&self, days: i64) -> Result<()> {
        for repo in self.inner.db.list_repositories().await? {
            if repo.state == RepositoryState::Active {
                self.import_repo_history(repo.id, days).await?;
            }
        }
        self.rebuild_analytics().await?;
        Ok(())
    }

    pub async fn import_repository(&self, selector: &str, days: i64) -> Result<()> {
        let repo = self
            .get_repository(selector)
            .await?
            .ok_or_else(|| anyhow!("repository not found: {selector}"))?;
        self.import_repo_history(repo.id, days).await?;
        self.rebuild_analytics().await
    }

    pub async fn dashboard_view(&self) -> Result<DashboardView> {
        let config = self.inner.config.read().await.clone();
        let current_day = current_rollup_day(&config.settings);
        let rollups = self.inner.db.list_daily_rollups(None, 90).await?;
        let today = rollup_for_day(&rollups, current_day)
            .cloned()
            .unwrap_or_else(|| today_empty_rollup(current_day));
        let streaks = compute_streaks_as_of(&rollups, current_day);
        let goal_progress = vec![
            GoalProgress {
                label: "Changed Lines".into(),
                current: today.live_additions + today.live_deletions,
                target: config.settings.goals.changed_lines_per_day,
            },
            GoalProgress {
                label: "Commits".into(),
                current: today.commits,
                target: config.settings.goals.commits_per_day,
            },
            GoalProgress {
                label: "Focus Minutes".into(),
                current: today.focus_minutes,
                target: config.settings.goals.focus_minutes_per_day,
            },
        ];

        let activity_feed = self
            .inner
            .db
            .recent_activity_feed(20)
            .await?
            .into_iter()
            .map(|(repo_name, kind, observed_at)| ActivityFeedItem {
                repo_name,
                kind,
                observed_at_label: format_local(observed_at, &config.settings.ui.timezone),
            })
            .collect();

        Ok(DashboardView {
            today: TodaySummary {
                live_lines: today.live_additions + today.live_deletions,
                staged_lines: today.staged_additions + today.staged_deletions,
                commits_today: today.commits,
                pushes_today: today.pushes,
                active_session_minutes: today.focus_minutes,
                streak_days: streaks.current_days,
                best_streak_days: streaks.best_days,
                today_score: today.score,
                goal_progress,
            },
            activity_feed,
            trend: rollups.iter().take(30).cloned().map(to_trend).collect(),
            heatmap: rollups.iter().take(84).cloned().map(to_trend).collect(),
            repo_cards: self.repository_cards().await?,
        })
    }

    pub async fn repository_cards(&self) -> Result<Vec<RepoCard>> {
        let current_day = {
            let config = self.inner.config.read().await;
            current_rollup_day(&config.settings)
        };
        let repos = self.inner.db.list_repositories().await?;
        let mut cards = Vec::new();
        for repo in repos {
            let snapshot = self.inner.db.latest_snapshot(repo.id).await?;
            let rollups = self.inner.db.list_daily_rollups(Some(repo.id), 14).await?;
            let today = rollup_for_day(&rollups, current_day);
            let health = match snapshot.as_ref() {
                Some(snapshot) if snapshot.is_detached => RepoHealth::DetachedHead,
                Some(snapshot) if snapshot.upstream_ref.is_none() => RepoHealth::MissingUpstream,
                Some(_) => RepoHealth::Healthy,
                None => RepoHealth::Error,
            };
            let sparkline_scores =
                rollups.iter().take(7).map(|entry| entry.score).collect::<Vec<_>>();
            cards.push(RepoCard {
                repo: repo.clone(),
                snapshot: snapshot.clone(),
                health,
                metrics: RepositoryMetrics {
                    commits_today: today.map(|entry| entry.commits).unwrap_or(0),
                    pushes_today: today.map(|entry| entry.pushes).unwrap_or(0),
                    files_touched_today: today.map(|entry| entry.files_touched).unwrap_or(0),
                    focus_minutes_today: today.map(|entry| entry.focus_minutes).unwrap_or(0),
                    score_today: today.map(|entry| entry.score).unwrap_or(0),
                },
                sparkline: scale_sparkline(&sparkline_scores, 60),
            });
        }
        Ok(cards)
    }

    pub async fn repo_detail(&self, selector: &str) -> Result<RepoDetailView> {
        let repo = self
            .get_repository(selector)
            .await?
            .ok_or_else(|| anyhow!("repository not found: {selector}"))?;
        let card = self
            .repository_cards()
            .await?
            .into_iter()
            .find(|card| card.repo.id == repo.id)
            .ok_or_else(|| anyhow!("repository metrics unavailable"))?;
        let snapshot = card.snapshot.clone();
        let language_breakdown = snapshot
            .as_ref()
            .map(|entry| {
                serde_json::from_str::<Vec<gitpulse_infra::LanguageStat>>(
                    &entry.language_breakdown_json,
                )
            })
            .transpose()?
            .unwrap_or_default()
            .into_iter()
            .map(|entry| (entry.language, entry.code + entry.comments + entry.blanks))
            .collect();
        let files_touched = self
            .inner
            .db
            .top_files_touched(repo.id, 12)
            .await?
            .into_iter()
            .map(|entry| (entry.path, entry.touches))
            .collect();
        let (include, exclude) = self.inner.db.repository_patterns(repo.id).await?;
        Ok(RepoDetailView {
            card,
            pattern_overrides: RepoPatternSettings { include, exclude },
            recent_commits: self.inner.db.list_commits(Some(repo.id), 20).await?,
            recent_pushes: self.inner.db.list_push_events(Some(repo.id), 10).await?,
            recent_sessions: self
                .inner
                .db
                .list_focus_sessions(20)
                .await?
                .into_iter()
                .filter(|session| session.repo_ids.contains(&repo.id))
                .collect(),
            language_breakdown,
            files_touched,
        })
    }

    pub async fn sessions_summary(&self) -> Result<SessionSummary> {
        let sessions = self.inner.db.list_focus_sessions(50).await?;
        let total_minutes = sessions.iter().map(|session| session.active_minutes).sum::<i64>();
        let longest = sessions.iter().map(|session| session.active_minutes).max().unwrap_or(0);
        let average = if sessions.is_empty() { 0 } else { total_minutes / sessions.len() as i64 };
        Ok(SessionSummary {
            sessions,
            total_minutes,
            average_length_minutes: average,
            longest_session_minutes: longest,
        })
    }

    pub async fn achievements_view(&self) -> Result<AchievementsView> {
        let current_day = {
            let config = self.inner.config.read().await;
            current_rollup_day(&config.settings)
        };
        let rollups = self.inner.db.list_daily_rollups(None, 120).await?;
        let streaks = compute_streaks_as_of(&rollups, current_day);
        Ok(AchievementsView {
            achievements: self.inner.db.list_achievements().await?,
            streak_current: streaks.current_days,
            streak_best: streaks.best_days,
            today_score: rollup_for_day(&rollups, current_day)
                .map(|entry| entry.score)
                .unwrap_or(0),
        })
    }

    pub async fn settings_view(&self) -> Result<SettingsView> {
        let config = self.inner.config.read().await.clone();
        Ok(SettingsView {
            settings: config.settings,
            config_path: self.inner.paths.config_file.display().to_string(),
            data_path: self.inner.paths.data_dir.display().to_string(),
            database_path: self.inner.paths.database_file.display().to_string(),
        })
    }

    pub async fn update_settings(&self, settings: AppSettings) -> Result<()> {
        self.inner.db.save_settings(&settings).await?;
        self.inner.config.write().await.settings = settings;
        self.rebuild_analytics().await
    }

    pub async fn update_repository_patterns(
        &self,
        selector: &str,
        patterns: RepoPatternSettings,
    ) -> Result<()> {
        let repo = self
            .get_repository(selector)
            .await?
            .ok_or_else(|| anyhow!("repository not found: {selector}"))?;
        let settings = self.inner.config.read().await.settings.clone();
        let mut include = settings.patterns.include;
        include.extend(patterns.include.clone());
        let mut exclude = settings.patterns.exclude;
        exclude.extend(patterns.exclude.clone());
        PathFilter::from_patterns(&include, &exclude)?;
        self.inner
            .db
            .set_repository_patterns(repo.id, &patterns.include, &patterns.exclude)
            .await?;
        if repo.state == RepositoryState::Active {
            self.refresh_repository(repo.id, true).await?;
        }
        Ok(())
    }

    pub async fn doctor(&self) -> Result<DoctorReport> {
        let repos = self.inner.db.list_repositories().await?;
        Ok(DoctorReport {
            git_available: self.git_available().await,
            db_path: self.inner.paths.database_file.display().to_string(),
            config_path: self.inner.paths.config_file.display().to_string(),
            watched_repositories: repos.iter().map(|repo| repo.root_path.clone()).collect(),
            repository_count: repos.len() as i64,
        })
    }

    pub async fn enqueue_refresh(&self, repo_id: Uuid) {
        let mut guard = self.inner.refresh_guard.lock().await;
        if guard.insert(repo_id) {
            let _ = self.inner.refresh_tx.send(RefreshSignal { repo_id });
        }
    }

    pub async fn rebuild_analytics(&self) -> Result<()> {
        let settings = self.inner.config.read().await.settings.clone();
        let score_formula = ScoreFormula::default();
        let repositories = self.inner.db.list_repositories().await?;
        let tracked_repo_ids = repositories
            .iter()
            .filter(|repo| repo.state != RepositoryState::Removed)
            .map(|repo| repo.id)
            .collect::<HashSet<_>>();

        let snapshot_rows = sqlx::query(
            "SELECT repo_id, observed_at_utc, language_breakdown_json, live_additions, live_deletions, staged_additions, staged_deletions
             FROM repo_status_snapshots ORDER BY observed_at_utc ASC",
        )
        .fetch_all(self.inner.db.pool())
        .await?;
        let file_rows = sqlx::query(
            "SELECT repo_id, observed_at_utc, relative_path, additions, deletions, kind
             FROM file_activity_events ORDER BY observed_at_utc ASC",
        )
        .fetch_all(self.inner.db.pool())
        .await?;
        let commit_rows = sqlx::query(
            "SELECT repo_id, authored_at_utc, additions, deletions, is_merge
             FROM commit_events ORDER BY authored_at_utc ASC",
        )
        .fetch_all(self.inner.db.pool())
        .await?;
        let push_rows = sqlx::query(
            "SELECT repo_id, observed_at_utc, kind
             FROM push_events ORDER BY observed_at_utc ASC",
        )
        .fetch_all(self.inner.db.pool())
        .await?;

        let mut activity = Vec::<ActivityPoint>::new();
        let mut by_scope = BTreeMap::<(Option<Uuid>, NaiveDate), DailyAccumulator>::new();
        let mut latest_snapshot_by_repo_day =
            BTreeMap::<(Uuid, NaiveDate), (i64, i64, i64, i64, i64)>::new();

        for row in &snapshot_rows {
            let repo_id: Uuid = row.get("repo_id");
            if !tracked_repo_ids.contains(&repo_id) {
                continue;
            }
            let observed_at_utc: DateTime<Utc> = row.get("observed_at_utc");
            let day = rollup_day(
                observed_at_utc,
                &settings.ui.timezone,
                settings.ui.day_boundary_minutes,
            );
            let language_breakdown = serde_json::from_str::<Vec<gitpulse_infra::LanguageStat>>(
                row.get::<String, _>("language_breakdown_json").as_str(),
            )
            .unwrap_or_default();
            latest_snapshot_by_repo_day.insert(
                (repo_id, day),
                (
                    row.get("live_additions"),
                    row.get("live_deletions"),
                    row.get("staged_additions"),
                    row.get("staged_deletions"),
                    language_breakdown.len() as i64,
                ),
            );
        }

        for (
            (repo_id, day),
            (live_additions, live_deletions, staged_additions, staged_deletions, languages_touched),
        ) in latest_snapshot_by_repo_day
        {
            let repo_accumulator = by_scope.entry((Some(repo_id), day)).or_default();
            repo_accumulator.live_additions = live_additions;
            repo_accumulator.live_deletions = live_deletions;
            repo_accumulator.staged_additions = staged_additions;
            repo_accumulator.staged_deletions = staged_deletions;
            repo_accumulator.languages_touched = languages_touched;

            let all_accumulator = by_scope.entry((None, day)).or_default();
            all_accumulator.live_additions += live_additions;
            all_accumulator.live_deletions += live_deletions;
            all_accumulator.staged_additions += staged_additions;
            all_accumulator.staged_deletions += staged_deletions;
            all_accumulator.languages_touched =
                all_accumulator.languages_touched.max(languages_touched);
        }

        for row in &file_rows {
            let repo_id: Uuid = row.get("repo_id");
            if !tracked_repo_ids.contains(&repo_id) {
                continue;
            }
            let observed_at_utc: DateTime<Utc> = row.get("observed_at_utc");
            let day = rollup_day(
                observed_at_utc,
                &settings.ui.timezone,
                settings.ui.day_boundary_minutes,
            );
            let additions: i64 = row.get("additions");
            let deletions: i64 = row.get("deletions");
            let relative_path: String = row.get("relative_path");
            let kind: String = row.get("kind");
            for scope in [Some(repo_id), None] {
                let accumulator = by_scope.entry((scope, day)).or_default();
                accumulator.files_touched.insert(relative_path.clone());
            }
            activity.push(ActivityPoint {
                repo_id,
                observed_at_utc,
                kind: match kind.as_str() {
                    "import" => ActivityKind::Import,
                    "manual_rescan" => ActivityKind::ManualRescan,
                    _ => ActivityKind::Refresh,
                },
                changed_lines: additions + deletions,
            });
        }

        for row in &commit_rows {
            let repo_id: Uuid = row.get("repo_id");
            if !tracked_repo_ids.contains(&repo_id) {
                continue;
            }
            let authored_at_utc: DateTime<Utc> = row.get("authored_at_utc");
            let day = rollup_day(
                authored_at_utc,
                &settings.ui.timezone,
                settings.ui.day_boundary_minutes,
            );
            let additions: i64 = row.get("additions");
            let deletions: i64 = row.get("deletions");
            let is_merge: bool = row.get("is_merge");
            for scope in [Some(repo_id), None] {
                let accumulator = by_scope.entry((scope, day)).or_default();
                if !is_merge {
                    accumulator.commits += 1;
                    accumulator.committed_additions += additions;
                    accumulator.committed_deletions += deletions;
                }
            }
            activity.push(ActivityPoint {
                repo_id,
                observed_at_utc: authored_at_utc,
                kind: ActivityKind::Commit,
                changed_lines: additions + deletions,
            });
        }

        for row in &push_rows {
            let repo_id: Uuid = row.get("repo_id");
            if !tracked_repo_ids.contains(&repo_id) {
                continue;
            }
            let observed_at_utc: DateTime<Utc> = row.get("observed_at_utc");
            let kind: String = row.get("kind");
            if kind != "push_detected_local" {
                continue;
            }
            let day = rollup_day(
                observed_at_utc,
                &settings.ui.timezone,
                settings.ui.day_boundary_minutes,
            );
            for scope in [Some(repo_id), None] {
                by_scope.entry((scope, day)).or_default().pushes += 1;
            }
            activity.push(ActivityPoint {
                repo_id,
                observed_at_utc,
                kind: ActivityKind::Push,
                changed_lines: 0,
            });
        }

        let sessions = sessionize(&activity, settings.monitoring.session_gap_minutes);
        self.inner.db.replace_focus_sessions(&sessions).await?;
        for session in &sessions {
            let day = rollup_day(
                session.started_at_utc,
                &settings.ui.timezone,
                settings.ui.day_boundary_minutes,
            );
            by_scope.entry((None, day)).or_default().focus_minutes += session.active_minutes;
            for repo_id in &session.repo_ids {
                by_scope.entry((Some(*repo_id), day)).or_default().focus_minutes +=
                    session.active_minutes;
            }
        }

        let mut rollups = Vec::with_capacity(by_scope.len());
        for ((repo_id, day), accumulator) in by_scope {
            let mut rollup = DailyRollup {
                repo_id,
                day,
                live_additions: accumulator.live_additions,
                live_deletions: accumulator.live_deletions,
                staged_additions: accumulator.staged_additions,
                staged_deletions: accumulator.staged_deletions,
                committed_additions: accumulator.committed_additions,
                committed_deletions: accumulator.committed_deletions,
                commits: accumulator.commits,
                pushes: accumulator.pushes,
                focus_minutes: accumulator.focus_minutes,
                files_touched: accumulator.files_touched.len() as i64,
                languages_touched: accumulator.languages_touched,
                score: 0,
            };
            rollup.score = score_formula.score(&rollup).total;
            rollups.push(rollup);
        }
        self.inner.db.replace_daily_rollups(&rollups).await?;

        let repo_count = tracked_repo_ids.len();
        let push_count = self
            .inner
            .db
            .list_push_events(None, 1000)
            .await?
            .into_iter()
            .filter(|push| tracked_repo_ids.contains(&push.repo_id))
            .count();
        let overall_rollups = self.inner.db.list_daily_rollups(None, 365).await?;
        let achievements =
            evaluate_achievements(repo_count, push_count, &overall_rollups, &sessions);
        self.inner.db.replace_achievements(&achievements).await?;

        Ok(())
    }

    async fn ensure_author_identity(&self) -> Result<()> {
        let mut config = self.inner.config.write().await;
        if !config.settings.authors.is_empty() {
            return Ok(());
        }
        let default_identity = self.inner.git.detect_default_identity(None).await?;
        if let Some(email) = default_identity.email {
            config.settings.authors.push(gitpulse_core::AuthorIdentity {
                email,
                name: default_identity.name,
                aliases: Vec::new(),
            });
            self.inner.db.save_settings(&config.settings).await?;
        }
        Ok(())
    }

    async fn verify_remote_push(&self, repo: &Repository, push: &PushEvent) -> Result<()> {
        let config = self.inner.config.read().await.clone();
        if !config.settings.github.enabled || !config.settings.github.verify_remote_pushes {
            return Ok(());
        }
        let Some(token) = config.settings.github.token else {
            return Ok(());
        };
        let Some(remote_url) = repo.remote_url.as_deref() else {
            return Ok(());
        };
        let Some(head_sha) = push.head_sha.as_deref() else {
            return Ok(());
        };

        if self.inner.github.verify_commit(remote_url, head_sha, &token).await?.is_some() {
            self.inner
                .db
                .insert_push_event(&PushEvent {
                    id: Uuid::new_v4(),
                    repo_id: repo.id,
                    observed_at_utc: Utc::now(),
                    kind: PushEventKind::PushRemoteConfirmed,
                    head_sha: Some(head_sha.to_string()),
                    pushed_commit_count: push.pushed_commit_count,
                    upstream_ref: push.upstream_ref.clone(),
                    notes: Some("GitHub API confirmed the commit is reachable remotely.".into()),
                })
                .await?;
        }
        Ok(())
    }

    async fn build_filter(&self, repo_id: Uuid, settings: &AppSettings) -> Result<PathFilter> {
        let (repo_include, repo_exclude) = self.inner.db.repository_patterns(repo_id).await?;
        let mut include = settings.patterns.include.clone();
        include.extend(repo_include);
        let mut exclude = settings.patterns.exclude.clone();
        exclude.extend(repo_exclude);
        PathFilter::from_patterns(&include, &exclude)
    }

    async fn watch_existing_repositories(&self) -> Result<()> {
        for repo in self.inner.db.list_repositories().await? {
            self.watch_repository(&repo).await?;
        }
        Ok(())
    }

    async fn disable_repository_if_root_missing(
        &self,
        repo: &Repository,
        phase: &'static str,
    ) -> Result<bool> {
        match std::fs::metadata(&repo.root_path) {
            Ok(metadata) if metadata.is_dir() => Ok(false),
            Ok(_) => {
                warn!(repo_id = %repo.id, path = %repo.root_path, phase, "repository root is not a directory; disabling repo");
                self.inner
                    .db
                    .set_repository_state(repo.id, RepositoryState::Disabled, false)
                    .await?;
                Ok(true)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                warn!(repo_id = %repo.id, path = %repo.root_path, phase, "repository root is missing; disabling repo");
                self.inner
                    .db
                    .set_repository_state(repo.id, RepositoryState::Disabled, false)
                    .await?;
                Ok(true)
            }
            Err(error) => Err(error.into()),
        }
    }

    async fn watch_repository(&self, repo: &Repository) -> Result<()> {
        if repo.state != RepositoryState::Active || !repo.is_monitored {
            return Ok(());
        }
        if self.disable_repository_if_root_missing(repo, "watch").await? {
            return Ok(());
        }
        if let Some(watcher) = self.inner.watcher.lock().await.as_mut() {
            watcher.watch_repo(repo.id, PathBuf::from(&repo.root_path))?;
        }
        Ok(())
    }

    async fn enqueue_all_active_repositories(&self) -> Result<()> {
        for repo in self.inner.db.list_repositories().await? {
            if repo.state == RepositoryState::Active && repo.is_monitored {
                self.enqueue_refresh(repo.id).await;
            }
        }
        Ok(())
    }

    async fn start_background_tasks(&self, mut refresh_rx: mpsc::UnboundedReceiver<RefreshSignal>) {
        let refresh_runtime = self.clone();
        let refresh_task = tokio::spawn(async move {
            while let Some(signal) = refresh_rx.recv().await {
                if let Err(error) = refresh_runtime.refresh_repository(signal.repo_id, false).await
                {
                    error!(?error, repo_id = %signal.repo_id, "background refresh failed");
                }
                refresh_runtime.inner.refresh_guard.lock().await.remove(&signal.repo_id);
            }
        });

        let poll_runtime = self.clone();
        let poll_task = tokio::spawn(async move {
            loop {
                let delay =
                    poll_runtime.inner.config.read().await.settings.monitoring.idle_poll_seconds;
                tokio::time::sleep(std::time::Duration::from_secs(delay.max(5))).await;
                if let Err(error) = poll_runtime.enqueue_all_active_repositories().await {
                    warn!(?error, "failed to enqueue periodic refresh");
                }
            }
        });

        let mut tasks = self.inner.background_tasks.lock().await;
        tasks.push(refresh_task);
        tasks.push(poll_task);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoctorReport {
    pub git_available: bool,
    pub db_path: String,
    pub config_path: String,
    pub watched_repositories: Vec<String>,
    pub repository_count: i64,
}

#[derive(Default)]
struct DailyAccumulator {
    live_additions: i64,
    live_deletions: i64,
    staged_additions: i64,
    staged_deletions: i64,
    committed_additions: i64,
    committed_deletions: i64,
    commits: i64,
    pushes: i64,
    focus_minutes: i64,
    files_touched: HashSet<String>,
    languages_touched: i64,
}

fn normalize_path(path: &Path) -> Result<PathBuf> {
    if path.exists() {
        std::fs::canonicalize(path).map_err(Into::into)
    } else if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}

fn current_rollup_day(settings: &AppSettings) -> NaiveDate {
    rollup_day(Utc::now(), &settings.ui.timezone, settings.ui.day_boundary_minutes)
}

fn rollup_for_day(rollups: &[DailyRollup], day: NaiveDate) -> Option<&DailyRollup> {
    rollups.iter().find(|entry| entry.day == day)
}

fn today_empty_rollup(day: NaiveDate) -> DailyRollup {
    DailyRollup {
        repo_id: None,
        day,
        live_additions: 0,
        live_deletions: 0,
        staged_additions: 0,
        staged_deletions: 0,
        committed_additions: 0,
        committed_deletions: 0,
        commits: 0,
        pushes: 0,
        focus_minutes: 0,
        files_touched: 0,
        languages_touched: 0,
        score: 0,
    }
}

fn to_trend(rollup: DailyRollup) -> TrendPoint {
    TrendPoint {
        day: rollup.day,
        changed_lines: rollup.live_additions + rollup.live_deletions,
        commits: rollup.commits,
        pushes: rollup.pushes,
        focus_minutes: rollup.focus_minutes,
        score: rollup.score,
    }
}

fn scale_sparkline(values: &[i64], max_height: i64) -> Vec<i64> {
    let max_value = values.iter().copied().max().unwrap_or(0);
    if max_value <= 0 || max_height <= 0 {
        return values.iter().map(|_| 0).collect();
    }

    values
        .iter()
        .map(|value| {
            if *value <= 0 {
                0
            } else {
                (((*value as f64 / max_value as f64) * max_height as f64).round() as i64)
                    .clamp(6, max_height)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::scale_sparkline;

    #[test]
    fn scale_sparkline_clamps_large_scores_into_card_height() {
        let scaled = scale_sparkline(&[5_267, 3_670, 0], 60);
        assert_eq!(scaled, vec![60, 42, 0]);
    }

    #[test]
    fn scale_sparkline_returns_zeroes_when_no_positive_values_exist() {
        let scaled = scale_sparkline(&[0, 0, 0], 60);
        assert_eq!(scaled, vec![0, 0, 0]);
    }
}
