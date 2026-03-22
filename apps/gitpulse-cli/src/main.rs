use anyhow::Result;
use clap::{Parser, Subcommand};
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime, RebuildReport};
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
            let report = runtime.rebuild_analytics_report().await?;
            println!("{}", format_rebuild_report(&report));
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

fn format_rebuild_report(report: &RebuildReport) -> String {
    [
        "Rebuilt daily rollups, sessions, and achievements.".to_string(),
        format!("strategy: {}", report.strategy),
        format!("tracked repositories: {}", report.tracked_repository_count),
        format!(
            "rows scanned: snapshots {}, file activity {}, commits {}, pushes {}",
            report.snapshot_rows, report.file_activity_rows, report.commit_rows, report.push_rows
        ),
        format!("latest snapshot repo-days: {}", report.snapshot_repo_days),
        format!(
            "derived outputs: activity points {}, sessions {}, rollups {}, achievements {}",
            report.activity_points,
            report.sessions_written,
            report.rollups_written,
            report.achievements_written
        ),
        format!("elapsed: {} ms", report.elapsed_ms),
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::format_rebuild_report;
    use gitpulse_runtime::RebuildReport;

    #[test]
    fn format_rebuild_report_includes_key_stats() {
        let report = RebuildReport {
            strategy: "full_history_synchronous".into(),
            tracked_repository_count: 3,
            snapshot_rows: 11,
            snapshot_repo_days: 7,
            file_activity_rows: 29,
            commit_rows: 13,
            push_rows: 5,
            activity_points: 47,
            sessions_written: 4,
            rollups_written: 8,
            achievements_written: 2,
            elapsed_ms: 88,
        };

        let formatted = format_rebuild_report(&report);

        assert!(formatted.contains("strategy: full_history_synchronous"));
        assert!(formatted.contains("tracked repositories: 3"));
        assert!(
            formatted
                .contains("rows scanned: snapshots 11, file activity 29, commits 13, pushes 5")
        );
        assert!(formatted.contains("latest snapshot repo-days: 7"));
        assert!(formatted.contains(
            "derived outputs: activity points 47, sessions 4, rollups 8, achievements 2"
        ));
        assert!(formatted.contains("elapsed: 88 ms"));
    }
}
