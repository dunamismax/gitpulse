use std::{path::Path, process::Command};

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
        AppConfig::default(),
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
        AppConfig::default(),
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
