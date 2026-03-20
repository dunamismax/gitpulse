use std::{path::Path, process::Command};

use gitpulse_core::RepoPatternSettings;
use gitpulse_infra::{GitCli, PathFilter};
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

#[tokio::test]
async fn discovers_nested_repositories() {
    let temp = tempdir().unwrap();
    let parent = temp.path();
    let repo_a = parent.join("alpha");
    let repo_b = parent.join("tools/beta");
    std::fs::create_dir_all(&repo_a).unwrap();
    std::fs::create_dir_all(&repo_b).unwrap();
    init_repo(&repo_a);
    init_repo(&repo_b);

    let git_cli = GitCli::new();
    let repos = git_cli.discover_repositories(parent, 4).await.unwrap();
    assert_eq!(repos.len(), 2);
}

#[tokio::test]
async fn live_snapshot_respects_default_exclusions() {
    let temp = tempdir().unwrap();
    init_repo(temp.path());
    std::fs::write(temp.path().join("src.rs"), "fn main() {}\n").unwrap();
    std::fs::create_dir_all(temp.path().join("target/debug")).unwrap();
    std::fs::write(temp.path().join("target/debug/junk.rs"), "generated\ncontent\n").unwrap();
    std::fs::write(temp.path().join("Cargo.lock"), "lockfile\n").unwrap();

    let filter = PathFilter::from_patterns(&[], &RepoPatternSettings::default().exclude).unwrap();
    let snapshot = GitCli::new().snapshot_repository(temp.path(), &filter, false).await.unwrap();

    assert_eq!(snapshot.live_stats.additions, 1);
    assert_eq!(snapshot.live_stats.file_count, 1);
}

#[tokio::test]
async fn imports_recent_history_for_matching_identity() {
    let temp = tempdir().unwrap();
    init_repo(temp.path());
    std::fs::write(temp.path().join("README.md"), "hello\n").unwrap();
    git(&["add", "."], temp.path());
    git(&["commit", "-m", "initial"], temp.path());

    let filter = PathFilter::from_patterns(&[], &RepoPatternSettings::default().exclude).unwrap();
    let imported = GitCli::new()
        .import_history(
            uuid::Uuid::new_v4(),
            temp.path(),
            &[String::from("tester@example.com")],
            30,
            &filter,
        )
        .await
        .unwrap();

    assert_eq!(imported.len(), 1);
    assert_eq!(imported[0].commit.summary, "initial");
}
