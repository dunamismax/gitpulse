use anyhow::Result;
use config::{Config, Environment, File};
use gitpulse_core::{
    AppSettings, AuthorIdentity, GithubSettings, GoalSettings, MonitoringSettings,
    RepoPatternSettings, UiSettings,
};
use serde::{Deserialize, Serialize};

use crate::dirs::AppPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub settings: AppSettings,
    #[serde(default)]
    pub server_host: String,
    #[serde(default = "default_port")]
    pub server_port: u16,
}

fn default_port() -> u16 {
    7467
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            settings: AppSettings {
                authors: Vec::<AuthorIdentity>::new(),
                goals: GoalSettings::default(),
                patterns: RepoPatternSettings::default(),
                github: GithubSettings::default(),
                monitoring: MonitoringSettings::default(),
                ui: UiSettings::default(),
                last_boot_at: None,
            },
            server_host: "127.0.0.1".into(),
            server_port: default_port(),
        }
    }
}

pub struct ConfigLoader {
    paths: AppPaths,
}

impl ConfigLoader {
    pub fn new(paths: AppPaths) -> Self {
        Self { paths }
    }

    pub fn load(&self) -> Result<AppConfig> {
        let defaults = AppConfig::default();
        let config = Config::builder()
            .set_default("server_host", defaults.server_host)?
            .set_default("server_port", defaults.server_port)?
            .set_default(
                "settings.goals.changed_lines_per_day",
                defaults.settings.goals.changed_lines_per_day,
            )?
            .set_default("settings.goals.commits_per_day", defaults.settings.goals.commits_per_day)?
            .set_default(
                "settings.goals.focus_minutes_per_day",
                defaults.settings.goals.focus_minutes_per_day,
            )?
            .set_default(
                "settings.monitoring.import_days",
                defaults.settings.monitoring.import_days,
            )?
            .set_default(
                "settings.monitoring.session_gap_minutes",
                defaults.settings.monitoring.session_gap_minutes,
            )?
            .set_default(
                "settings.monitoring.repo_discovery_depth",
                defaults.settings.monitoring.repo_discovery_depth as i64,
            )?
            .set_default(
                "settings.monitoring.watcher_debounce_ms",
                defaults.settings.monitoring.watcher_debounce_ms,
            )?
            .set_default(
                "settings.monitoring.idle_poll_seconds",
                defaults.settings.monitoring.idle_poll_seconds,
            )?
            .set_default(
                "settings.monitoring.live_poll_seconds",
                defaults.settings.monitoring.live_poll_seconds,
            )?
            .set_default("settings.ui.timezone", defaults.settings.ui.timezone)?
            .set_default(
                "settings.ui.day_boundary_minutes",
                defaults.settings.ui.day_boundary_minutes,
            )?
            .set_default("settings.github.enabled", defaults.settings.github.enabled)?
            .set_default(
                "settings.github.verify_remote_pushes",
                defaults.settings.github.verify_remote_pushes,
            )?
            .set_default("settings.patterns.include", defaults.settings.patterns.include)?
            .set_default("settings.patterns.exclude", defaults.settings.patterns.exclude)?
            .add_source(File::from(self.paths.config_file.clone()).required(false))
            .add_source(Environment::with_prefix("GITPULSE").separator("__"))
            .build()?;
        Ok(config.try_deserialize()?)
    }
}
