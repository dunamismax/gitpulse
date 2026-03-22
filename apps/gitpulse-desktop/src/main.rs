#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, time::Duration};

use anyhow::{Context, Result};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tokio::time::{Instant, sleep};

#[derive(Clone, Debug)]
struct DesktopSmokeTest {
    enabled: bool,
    timeout: Duration,
    poll_interval: Duration,
}

impl DesktopSmokeTest {
    fn from_env() -> Result<Self> {
        Ok(Self {
            enabled: parse_bool_env("GITPULSE_DESKTOP_SMOKE_TEST")?.unwrap_or(false),
            timeout: Duration::from_secs(
                env_u64("GITPULSE_DESKTOP_SMOKE_TIMEOUT_SECS")?.unwrap_or(20),
            ),
            poll_interval: Duration::from_millis(
                env_u64("GITPULSE_DESKTOP_SMOKE_POLL_MS")?.unwrap_or(250),
            ),
        })
    }
}

fn parse_bool_env(key: &str) -> Result<Option<bool>> {
    match env::var(key) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Ok(Some(true)),
            "0" | "false" | "no" | "off" => Ok(Some(false)),
            value => {
                anyhow::bail!("{key} must be one of 1/0/true/false/yes/no/on/off, got {value}")
            }
        },
        Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(error).with_context(|| format!("failed to read {key}")),
    }
}

fn env_u64(key: &str) -> Result<Option<u64>> {
    match env::var(key) {
        Ok(value) => value
            .trim()
            .parse::<u64>()
            .with_context(|| format!("{key} must be an integer"))
            .map(Some),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(error).with_context(|| format!("failed to read {key}")),
    }
}

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let selected =
            folder.and_then(|handle| handle.as_path().map(|path| path.display().to_string()));
        let _ = sender.send(selected);
    });
    receiver.await.map_err(|error| error.to_string())
}

async fn run_desktop_smoke_test(app: tauri::AppHandle, url: String, smoke_test: DesktopSmokeTest) {
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(2)).build() {
        Ok(client) => client,
        Err(error) => {
            eprintln!("GitPulse desktop smoke check could not build HTTP client: {error}");
            app.exit(1);
            return;
        }
    };

    let deadline = Instant::now() + smoke_test.timeout;

    loop {
        let last_error = match client.get(&url).send().await {
            Ok(response) => {
                let status = response.status();
                match response.text().await {
                    Ok(body) if status.is_success() && body.contains("GitPulse") => {
                        println!("GitPulse desktop smoke check passed for {url}");
                        app.exit(0);
                        return;
                    }
                    Ok(_) => format!(
                        "received HTTP {status} from desktop shell without expected GitPulse marker"
                    ),
                    Err(error) => format!(
                        "received HTTP {status} from desktop shell but failed to read body: {error}"
                    ),
                }
            }
            Err(error) => error.to_string(),
        };

        if Instant::now() >= deadline {
            eprintln!(
                "GitPulse desktop smoke check timed out after {}s for {url}: {}",
                smoke_test.timeout.as_secs(),
                last_error
            );
            app.exit(1);
            return;
        }

        sleep(smoke_test.poll_interval).await;
    }
}

fn main() {
    let smoke_test = DesktopSmokeTest::from_env().expect("valid desktop smoke env configuration");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![pick_folder])
        .setup(move |app| -> std::result::Result<(), Box<dyn std::error::Error>> {
            let runtime =
                tauri::async_runtime::block_on(GitPulseRuntime::bootstrap(BootstrapOptions {
                    port_override: Some(0),
                    start_background_tasks: true,
                }))
                .map_err(|error| std::io::Error::other(error.to_string()))?;

            let listener =
                tauri::async_runtime::block_on(tokio::net::TcpListener::bind(("127.0.0.1", 0)))
                    .map_err(std::io::Error::other)?;
            let addr = listener.local_addr().map_err(std::io::Error::other)?;
            let url = format!("http://{addr}");

            let server_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = gitpulse_web::run(server_runtime, listener).await {
                    eprintln!("GitPulse desktop server failed: {error}");
                }
            });

            println!("GitPulse desktop listening on {url}");

            let app_handle = app.handle().clone();
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("valid localhost url")),
            )
            .title("GitPulse")
            .inner_size(1440.0, 960.0)
            .build()?;

            if smoke_test.enabled {
                tauri::async_runtime::spawn(run_desktop_smoke_test(
                    app_handle,
                    url,
                    smoke_test.clone(),
                ));
            }

            app.manage(runtime);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
