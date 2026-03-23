use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use gitpulse_infra::{AppConfig, AppPaths};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use sqlx::PgPool;
use tempfile::tempdir;
use tower::ServiceExt;
use uuid::Uuid;

use std::{path::Path, process::Command};

fn test_paths(base: &std::path::Path) -> AppPaths {
    AppPaths {
        config_dir: base.join("config"),
        data_dir: base.join("data"),
        log_dir: base.join("logs"),
        config_file: base.join("config/gitpulse.toml"),
    }
}

async fn create_test_db() -> String {
    let admin_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://localhost/postgres".into());

    let db_name = format!("gitpulse_t{}", Uuid::new_v4().to_string().replace('-', ""));

    let pool = PgPool::connect(&admin_url)
        .await
        .expect("failed to connect to admin database; set DATABASE_URL env var to a postgres admin URL");

    sqlx::query(&format!("CREATE DATABASE \"{}\"", db_name))
        .execute(&pool)
        .await
        .expect("failed to create test database");

    pool.close().await;

    let base = admin_url.rfind('/').map(|i| &admin_url[..i]).unwrap_or(&admin_url);
    format!("{}/{}", base, db_name)
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
    let mut config = AppConfig::default();
    config.database_url = create_test_db().await;

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config,
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

    let mut config = AppConfig::default();
    config.database_url = create_test_db().await;

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config,
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

#[tokio::test]
async fn settings_page_does_not_reflect_stored_github_token() {
    let temp = tempdir().unwrap();
    let mut config = AppConfig::default();
    config.database_url = create_test_db().await;
    config.settings.github.enabled = true;
    config.settings.github.verify_remote_pushes = true;
    config.settings.github.token = Some("super-secret-token".into());

    let runtime = GitPulseRuntime::bootstrap_in(
        test_paths(temp.path()),
        config,
        BootstrapOptions { port_override: None, start_background_tasks: false },
    )
    .await
    .unwrap();
    let app = gitpulse_web::router(runtime);

    let response = app
        .oneshot(Request::builder().uri("/settings").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body = String::from_utf8(body.to_vec()).unwrap();
    assert!(!body.contains("super-secret-token"));
    assert!(body.contains("name=\"github_token\""));
}
