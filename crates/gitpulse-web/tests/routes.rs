use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use gitpulse_infra::{AppConfig, AppPaths};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use tempfile::tempdir;
use tower::ServiceExt;

use std::{path::Path, process::Command};

fn test_paths(base: &std::path::Path) -> AppPaths {
    AppPaths {
        config_dir: base.join("config"),
        data_dir: base.join("data"),
        log_dir: base.join("logs"),
        config_file: base.join("config/gitpulse.toml"),
        database_file: base.join("data/gitpulse.sqlite3"),
    }
}

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
async fn key_pages_render_successfully() {
    let temp = tempdir().unwrap();
    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        AppConfig::default(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();
    let app = gitpulse_web::router(runtime);

    for path in ["/", "/repositories", "/sessions", "/achievements", "/settings"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "failed path: {path}");
    }
}

#[tokio::test]
async fn repository_pattern_form_updates_repo_overrides() {
    let temp = tempdir().unwrap();
    let repo = temp.path().join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    init_repo(&repo);
    std::fs::write(repo.join("README.md"), "hello\n").unwrap();
    git(&["add", "."], &repo);
    git(&["commit", "-m", "initial"], &repo);

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        AppConfig::default(),
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();
    let tracked = runtime.add_target(&repo).await.unwrap();
    let repo_id = tracked[0].id.to_string();
    let app = gitpulse_web::router(runtime.clone());

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/repositories/{repo_id}/patterns"))
                .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(Body::from(
                    "include_patterns=src%2F%2A%2A&exclude_patterns=fixtures%2F%2A%2A%0Agenerated%2F%2A%2A",
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::SEE_OTHER);

    let detail = runtime.repo_detail(&repo_id).await.unwrap();
    assert_eq!(detail.pattern_overrides.include, vec!["src/**"]);
    assert_eq!(detail.pattern_overrides.exclude, vec!["fixtures/**", "generated/**"]);
}
