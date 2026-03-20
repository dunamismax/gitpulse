use std::{collections::HashMap, path::PathBuf, sync::Arc};

use anyhow::Result;
use notify::RecursiveMode;
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};
use tokio::sync::mpsc;
use tracing::warn;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct RefreshSignal {
    pub repo_id: Uuid,
}

pub struct WatcherService {
    debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    repo_paths: Arc<std::sync::Mutex<HashMap<PathBuf, Uuid>>>,
}

impl WatcherService {
    pub fn new(sender: mpsc::UnboundedSender<RefreshSignal>, debounce_ms: u64) -> Result<Self> {
        let repo_paths = Arc::new(std::sync::Mutex::new(HashMap::<PathBuf, Uuid>::new()));
        let repo_paths_for_callback = repo_paths.clone();

        let debouncer = new_debouncer(
            std::time::Duration::from_millis(debounce_ms),
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => {
                    let Ok(repo_paths) = repo_paths_for_callback.lock() else {
                        return;
                    };
                    for event in events {
                        for watched in &event.paths {
                            if let Some((_, repo_id)) =
                                repo_paths.iter().find(|(path, _)| watched.starts_with(path))
                            {
                                let _ = sender.send(RefreshSignal { repo_id: *repo_id });
                            }
                        }
                    }
                }
                Err(errors) => {
                    for error in errors {
                        warn!(?error, "watcher event error");
                    }
                }
            },
        )?;

        Ok(Self { debouncer, repo_paths })
    }

    pub fn watch_repo(&mut self, repo_id: Uuid, path: PathBuf) -> Result<()> {
        self.debouncer.watch(path.as_path(), RecursiveMode::Recursive)?;
        self.repo_paths.lock().expect("watcher repo map lock poisoned").insert(path, repo_id);
        Ok(())
    }
}
