use axum::{body::Body, http::Request};
use gitpulse_infra::{AppConfig, AppPaths};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use tempfile::tempdir;
use tower::ServiceExt;

fn test_paths(base: &std::path::Path) -> AppPaths {
    AppPaths {
        config_dir: base.join("config"),
        data_dir: base.join("data"),
        log_dir: base.join("logs"),
        config_file: base.join("config/gitpulse.toml"),
        database_file: base.join("data/gitpulse.sqlite3"),
    }
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
