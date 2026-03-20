use anyhow::Result;
use clap::{Parser, Subcommand};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "gitpulse", version, about = "Local-first git activity dashboard")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Serve {
        #[arg(long)]
        port: Option<u16>,
    },
    Add {
        path: String,
    },
    Rescan {
        #[arg(long)]
        all: bool,
        #[arg(long)]
        repo: Option<String>,
    },
    Import {
        #[arg(long, default_value_t = 30)]
        days: i64,
        #[arg(long)]
        all: bool,
        #[arg(long)]
        repo: Option<String>,
    },
    RebuildRollups,
    Doctor,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();
    match cli.command {
        Command::Serve { port } => {
            let runtime = GitPulseRuntime::bootstrap(BootstrapOptions {
                port_override: port,
                start_background_tasks: true,
            })
            .await?;
            let config = runtime.config().await;
            let listener =
                TcpListener::bind((config.server_host.as_str(), config.server_port)).await?;
            let addr = listener.local_addr()?;
            println!("GitPulse listening on http://{}", addr);
            gitpulse_web::run(runtime, listener).await?;
        }
        Command::Add { path } => {
            let runtime = GitPulseRuntime::bootstrap(BootstrapOptions {
                start_background_tasks: false,
                ..BootstrapOptions::default()
            })
            .await?;
            let repos = runtime.add_target(path).await?;
            for repo in repos {
                println!("tracked {}", repo.root_path);
            }
        }
        Command::Rescan { all, repo } => {
            let runtime = GitPulseRuntime::bootstrap(BootstrapOptions {
                start_background_tasks: false,
                ..BootstrapOptions::default()
            })
            .await?;
            if all {
                runtime.rescan_all().await?;
            } else if let Some(repo) = repo {
                runtime.rescan_repository(&repo).await?;
            }
        }
        Command::Import { days, all, repo } => {
            let runtime = GitPulseRuntime::bootstrap(BootstrapOptions {
                start_background_tasks: false,
                ..BootstrapOptions::default()
            })
            .await?;
            if all {
                runtime.import_all(days).await?;
            } else if let Some(repo) = repo {
                runtime.import_repository(&repo, days).await?;
            }
        }
        Command::RebuildRollups => {
            let runtime = GitPulseRuntime::bootstrap(BootstrapOptions {
                start_background_tasks: false,
                ..BootstrapOptions::default()
            })
            .await?;
            runtime.rebuild_analytics().await?;
            println!("Rebuilt daily rollups, sessions, and achievements.");
        }
        Command::Doctor => {
            let runtime = GitPulseRuntime::bootstrap(BootstrapOptions {
                start_background_tasks: false,
                ..BootstrapOptions::default()
            })
            .await?;
            let report = runtime.doctor().await?;
            println!("git available: {}", report.git_available);
            println!("db path: {}", report.db_path);
            println!("config path: {}", report.config_path);
            println!("tracked repos: {}", report.repository_count);
            for repo in report.watched_repositories {
                println!(" - {}", repo);
            }
        }
    }
    Ok(())
}
