use std::path::PathBuf;

use anyhow::{Context, Result};
use directories::ProjectDirs;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub log_dir: PathBuf,
    pub config_file: PathBuf,
    pub database_file: PathBuf,
}

impl AppPaths {
    pub fn discover() -> Result<Self> {
        let project = ProjectDirs::from("dev", "GitPulse", "GitPulse")
            .context("failed to resolve platform app directories")?;
        let config_dir = project.config_dir().to_path_buf();
        let data_dir = project.data_dir().to_path_buf();
        let log_dir = project.data_local_dir().join("logs");
        let config_file = config_dir.join("gitpulse.toml");
        let database_file = data_dir.join("gitpulse.sqlite3");
        Ok(Self { config_dir, data_dir, log_dir, config_file, database_file })
    }

    pub fn ensure(&self) -> Result<()> {
        for dir in [&self.config_dir, &self.data_dir, &self.log_dir] {
            std::fs::create_dir_all(dir)?;
        }
        Ok(())
    }
}
