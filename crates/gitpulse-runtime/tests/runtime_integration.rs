use std::{path::Path, process::Command};

use gitpulse_core::{AuthorIdentity, RepoPatternSettings};
use gitpulse_infra::{AppConfig, AppPaths};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use tempfile::tempdir;

fn git(args: &[&str], cwd: &Path) {
    let status = Command::new("git").args(args).current_dir(cwd).status().unwrap();
    assert!(status.success(), "git command failed: {:?}", args);
}

fn init_repo(root: &Path) {
    git(&["init", "-b", "main"], root);
    git(&["config", "user.name", "GitPulse Tester"], root);
    git(&["config", "user.email", "tester@example.com"], root);
}

fn write_and_commit(root: &Path, name: &str, content: &str, message: &str) {
    std::fs::write(root.join(name), content).unwrap();
    git(&["add", "."], root);
    git(&["commit", "-m", message], root);
}

fn test_paths(base: &Path) -> AppPaths {
    AppPaths {
        config_dir: base.join("config"),
        data_dir: base.join("data"),
        log_dir: base.join("logs"),
        config_file: base.join("config/gitpulse.toml"),
        database_file: base.join("data/gitpulse.sqlite3"),
    }
}

async fn count_file_activity_kind(runtime: &GitPulseRuntime, kind: &str) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM file_activity_events WHERE kind = ?1")
        .bind(kind)
        .fetch_one(runtime.db().pool())
        .await
        .unwrap()
}

fn config_with_test_author() -> AppConfig {
    let mut config = AppConfig::default();
    config.settings.authors.push(AuthorIdentity {
        email: "tester@example.com".into(),
        name: Some("GitPulse Tester".into()),
        aliases: Vec::new(),
    });
    config
}

#[tokio::test]
async fn add_target_discovers_repositories_under_parent_folder() {
    let temp = tempdir().unwrap();
    let workspace = temp.path().join("workspace");
    let alpha = workspace.join("alpha");
    let beta = workspace.join("tools/beta");
    std::fs::create_dir_all(&alpha).unwrap();
    std::fs::create_dir_all(&beta).unwrap();
    init_repo(&alpha);
    init_repo(&beta);

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config_with_test_author(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();

    let repos: Vec<_> = runtime.add_target(&workspace).await.unwrap();
    assert_eq!(repos.len(), 2);
}

#[tokio::test]
async fn detects_push_when_ahead_count_drops() {
    let temp = tempdir().unwrap();
    let repo = temp.path().join("repo");
    let remote = temp.path().join("remote.git");
    std::fs::create_dir_all(&repo).unwrap();
    init_repo(&repo);
    write_and_commit(&repo, "README.md", "hello\n", "initial");
    git(&["init", "--bare", remote.to_str().unwrap()], temp.path());
    git(&["remote", "add", "origin", remote.to_str().unwrap()], &repo);
    git(&["push", "-u", "origin", "main"], &repo);

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config_with_test_author(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();

    let tracked: Vec<_> = runtime.add_target(&repo).await.unwrap();
    let repo_id = tracked[0].id;

    write_and_commit(&repo, "README.md", "hello\nworld\n", "second");
    runtime.refresh_repository(repo_id, true).await.unwrap();
    assert_eq!(runtime.db().list_push_events(Some(repo_id), 10).await.unwrap().len(), 0);

    git(&["push"], &repo);
    runtime.refresh_repository(repo_id, true).await.unwrap();
    let pushes = runtime.db().list_push_events(Some(repo_id), 10).await.unwrap();
    assert!(
        pushes
            .iter()
            .any(|push| matches!(push.kind, gitpulse_core::PushEventKind::PushDetectedLocal))
    );
}

#[tokio::test]
async fn updates_repository_pattern_overrides() {
    let temp = tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    init_repo(&repo);
    write_and_commit(&repo, "README.md", "hello\n", "initial");

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        AppConfig::default(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();

    let tracked = runtime.add_target(&repo).await.unwrap();
    let repo_id = tracked[0].id;
    let overrides = RepoPatternSettings {
        include: vec!["src/**".into()],
        exclude: vec!["fixtures/**".into(), "generated/**".into()],
    };

    runtime.update_repository_patterns(&repo_id.to_string(), overrides.clone()).await.unwrap();

    let detail = runtime.repo_detail(&repo_id.to_string()).await.unwrap();
    assert_eq!(detail.pattern_overrides, overrides);
}

#[tokio::test]
async fn import_history_is_idempotent_for_file_activity_rows() {
    let temp = tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    init_repo(&repo);
    write_and_commit(&repo, "README.md", "hello\n", "initial");

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config_with_test_author(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();

    let tracked = runtime.add_target(&repo).await.unwrap();
    let repo_id = tracked[0].id;

    assert_eq!(count_file_activity_kind(&runtime, "import").await, 1);
    assert_eq!(runtime.db().list_commits(Some(repo_id), 10).await.unwrap().len(), 1);

    runtime.import_repository(&repo_id.to_string(), 30).await.unwrap();

    assert_eq!(count_file_activity_kind(&runtime, "import").await, 1);
    assert_eq!(runtime.db().list_commits(Some(repo_id), 10).await.unwrap().len(), 1);
}

#[tokio::test]
async fn rebuild_analytics_carries_staged_snapshot_totals_into_rollups() {
    let temp = tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    init_repo(&repo);
    write_and_commit(&repo, "README.md", "hello\n", "initial");

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config_with_test_author(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();

    let tracked = runtime.add_target(&repo).await.unwrap();
    let repo_id = tracked[0].id;

    std::fs::write(repo.join("README.md"), "hello\nworld\n").unwrap();
    git(&["add", "README.md"], &repo);

    runtime.refresh_repository(repo_id, true).await.unwrap();

    let snapshot = runtime.db().latest_snapshot(repo_id).await.unwrap().unwrap();
    assert_eq!(snapshot.staged_stats.additions, 1);
    assert_eq!(snapshot.staged_stats.deletions, 0);

    let repo_rollup = runtime.db().list_daily_rollups(Some(repo_id), 1).await.unwrap();
    let repo_today = repo_rollup.first().unwrap();
    assert_eq!(repo_today.staged_additions, 1);
    assert_eq!(repo_today.staged_deletions, 0);

    let overall_rollup = runtime.db().list_daily_rollups(None, 1).await.unwrap();
    let overall_today = overall_rollup.first().unwrap();
    assert_eq!(overall_today.staged_additions, 1);
    assert_eq!(overall_today.staged_deletions, 0);
}
