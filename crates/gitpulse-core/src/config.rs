use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthorIdentity {
    pub email: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoalSettings {
    pub changed_lines_per_day: i64,
    pub commits_per_day: i64,
    pub focus_minutes_per_day: i64,
}

impl Default for GoalSettings {
    fn default() -> Self {
        Self { changed_lines_per_day: 250, commits_per_day: 3, focus_minutes_per_day: 90 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RepoPatternSettings {
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

impl Default for RepoPatternSettings {
    fn default() -> Self {
        Self {
            include: Vec::new(),
            exclude: vec![
                ".git/**".into(),
                "target/**".into(),
                "node_modules/**".into(),
                "dist/**".into(),
                "build/**".into(),
                ".next/**".into(),
                "coverage/**".into(),
                "vendor/**".into(),
                "**/*.lock".into(),
                "**/*.min.js".into(),
                "**/*.map".into(),
                "**/*.png".into(),
                "**/*.jpg".into(),
                "**/*.jpeg".into(),
                "**/*.gif".into(),
                "**/*.pdf".into(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GithubSettings {
    pub enabled: bool,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub verify_remote_pushes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MonitoringSettings {
    pub import_days: i64,
    pub session_gap_minutes: i64,
    pub repo_discovery_depth: usize,
    pub watcher_debounce_ms: u64,
    pub idle_poll_seconds: u64,
    pub live_poll_seconds: u64,
}

impl Default for MonitoringSettings {
    fn default() -> Self {
        Self {
            import_days: 30,
            session_gap_minutes: 15,
            repo_discovery_depth: 5,
            watcher_debounce_ms: 700,
            idle_poll_seconds: 20,
            live_poll_seconds: 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UiSettings {
    pub timezone: String,
    pub day_boundary_minutes: i32,
}

impl Default for UiSettings {
    fn default() -> Self {
        Self { timezone: "UTC".into(), day_boundary_minutes: 0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub authors: Vec<AuthorIdentity>,
    #[serde(default)]
    pub goals: GoalSettings,
    #[serde(default)]
    pub patterns: RepoPatternSettings,
    #[serde(default)]
    pub github: GithubSettings,
    #[serde(default)]
    pub monitoring: MonitoringSettings,
    #[serde(default)]
    pub ui: UiSettings,
    #[serde(default)]
    pub last_boot_at: Option<DateTime<Utc>>,
}

impl AppSettings {
    pub fn author_emails(&self) -> Vec<String> {
        self.authors.iter().map(|author| author.email.clone()).collect()
    }
}
