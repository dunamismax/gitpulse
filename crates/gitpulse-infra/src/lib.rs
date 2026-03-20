pub mod config;
pub mod db;
pub mod dirs;
pub mod exclusions;
pub mod git;
pub mod github;
pub mod watcher;

pub use config::{AppConfig, ConfigLoader};
pub use db::{Database, DatabasePaths, PersistedAchievement, PersistedFileTouch};
pub use dirs::AppPaths;
pub use exclusions::PathFilter;
pub use git::{
    DefaultIdentity, DiscoveredRepository, GitCli, GitStatusSnapshot, ImportedCommit, LanguageStat,
    RepoDiscovery,
};
pub use github::GithubVerifier;
pub use watcher::{RefreshSignal, WatcherService};
