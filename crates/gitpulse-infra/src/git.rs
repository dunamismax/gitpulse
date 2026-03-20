use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};

use anyhow::{Result, anyhow};
use chrono::{DateTime, Duration, Utc};
use gitpulse_core::{CommitEvent, DiffStats};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use tokei::{Config as TokeiConfig, Languages};
use tokio::process::Command;
use tracing::warn;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::exclusions::PathFilter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultIdentity {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredRepository {
    pub root_path: PathBuf,
    pub name: String,
    pub remote_url: Option<String>,
    pub default_branch: Option<String>,
}

pub type RepoDiscovery = Vec<DiscoveredRepository>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageStat {
    pub language: String,
    pub code: i64,
    pub comments: i64,
    pub blanks: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatusSnapshot {
    pub branch: Option<String>,
    pub is_detached: bool,
    pub head_sha: Option<String>,
    pub upstream_ref: Option<String>,
    pub upstream_head_sha: Option<String>,
    pub ahead_count: i64,
    pub behind_count: i64,
    pub live_stats: DiffStats,
    pub staged_stats: DiffStats,
    pub touched_paths: Vec<(String, i64, i64)>,
    pub repo_size_bytes: i64,
    pub language_breakdown: Vec<LanguageStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedCommit {
    pub commit: CommitEvent,
    pub touched_paths: Vec<(String, i64, i64)>,
}

type PendingCommit = (String, DateTime<Utc>, Option<String>, Option<String>, bool, String);

#[derive(Clone, Default)]
pub struct GitCli;

impl GitCli {
    pub fn new() -> Self {
        Self
    }

    pub async fn is_available(&self) -> bool {
        self.run_git(None, ["--version"]).await.is_ok()
    }

    pub async fn resolve_repo_root(&self, path: &Path) -> Result<PathBuf> {
        let output = self.run_git(Some(path), ["rev-parse", "--show-toplevel"]).await?;
        Ok(PathBuf::from(output.trim()))
    }

    pub async fn detect_default_identity(
        &self,
        repo_root: Option<&Path>,
    ) -> Result<DefaultIdentity> {
        let name = self.config_value(repo_root, "user.name").await.ok();
        let email = self.config_value(repo_root, "user.email").await.ok();
        Ok(DefaultIdentity { name, email })
    }

    pub async fn discover_repositories(
        &self,
        root: &Path,
        max_depth: usize,
    ) -> Result<RepoDiscovery> {
        if self.resolve_repo_root(root).await.is_ok() {
            return Ok(vec![self.probe_repository(root).await?]);
        }

        let mut repos = Vec::new();
        for entry in WalkBuilder::new(root)
            .max_depth(Some(max_depth))
            .hidden(false)
            .git_ignore(false)
            .git_exclude(false)
            .build()
        {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    warn!(?error, "repo discovery entry failed");
                    continue;
                }
            };
            if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
            if entry.file_name() == ".git"
                && let Some(parent) = entry.path().parent()
            {
                repos.push(self.probe_repository(parent).await?);
            }
        }

        repos.sort_by(|left, right| left.root_path.cmp(&right.root_path));
        repos.dedup_by(|left, right| left.root_path == right.root_path);
        Ok(repos)
    }

    pub async fn probe_repository(&self, path: &Path) -> Result<DiscoveredRepository> {
        let root = self.resolve_repo_root(path).await?;
        let remote_url = self.config_value(Some(&root), "remote.origin.url").await.ok();
        let default_branch = self
            .run_git(Some(&root), ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"])
            .await
            .ok()
            .and_then(|value| value.trim().rsplit('/').next().map(str::to_string));

        Ok(DiscoveredRepository {
            name: root.file_name().and_then(|name| name.to_str()).unwrap_or("repo").to_string(),
            root_path: root,
            remote_url,
            default_branch,
        })
    }

    pub async fn snapshot_repository(
        &self,
        repo_root: &Path,
        filter: &PathFilter,
        include_size_scan: bool,
    ) -> Result<GitStatusSnapshot> {
        let status = self
            .run_git(
                Some(repo_root),
                ["status", "--porcelain=v2", "--branch", "--untracked-files=all"],
            )
            .await?;
        let head_sha = self.run_git(Some(repo_root), ["rev-parse", "HEAD"]).await.ok();
        let has_head = head_sha.as_ref().is_some();
        let empty_tree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
        let live_base = if has_head { "HEAD" } else { empty_tree };
        let staged_base = if has_head { "HEAD" } else { empty_tree };

        let (branch, is_detached, upstream_ref, ahead_count, behind_count, untracked) =
            parse_status(status.as_str());
        let upstream_head_sha = if upstream_ref.is_some() {
            self.run_git(Some(repo_root), ["rev-parse", "@{upstream}"])
                .await
                .ok()
                .map(|value| value.trim().to_string())
        } else {
            None
        };

        let (mut live_stats, mut live_paths) =
            self.diff_numstat(repo_root, &["diff", "--numstat", live_base], filter).await?;
        let (staged_stats, staged_paths) = self
            .diff_numstat(repo_root, &["diff", "--cached", "--numstat", staged_base], filter)
            .await?;

        for relative_path in &untracked {
            if !filter.allows(relative_path) {
                continue;
            }
            let full_path = repo_root.join(relative_path);
            if let Some(lines) = count_text_lines(&full_path)? {
                live_stats.additions += lines;
                live_stats.file_count += 1;
                live_paths.push((relative_path.clone(), lines, 0));
            }
        }

        let mut touched = BTreeMap::<String, (i64, i64)>::new();
        for (path, add, del) in live_paths.into_iter().chain(staged_paths.into_iter()) {
            let entry = touched.entry(path).or_insert((0, 0));
            entry.0 += add;
            entry.1 += del;
        }

        let (repo_size_bytes, language_breakdown) = if include_size_scan {
            tokio::task::spawn_blocking({
                let repo_root = repo_root.to_path_buf();
                let filter = filter.clone();
                move || compute_repo_size(&repo_root, &filter)
            })
            .await??
        } else {
            (0, Vec::new())
        };

        Ok(GitStatusSnapshot {
            branch,
            is_detached,
            head_sha: head_sha.map(|value| value.trim().to_string()),
            upstream_ref,
            upstream_head_sha,
            ahead_count,
            behind_count,
            live_stats,
            staged_stats,
            touched_paths: touched
                .into_iter()
                .map(|(path, (additions, deletions))| (path, additions, deletions))
                .collect(),
            repo_size_bytes,
            language_breakdown,
        })
    }

    pub async fn import_history(
        &self,
        repo_id: Uuid,
        repo_root: &Path,
        author_emails: &[String],
        days: i64,
        filter: &PathFilter,
    ) -> Result<Vec<ImportedCommit>> {
        let since = (Utc::now() - Duration::days(days.max(1))).to_rfc3339();
        let output = self
            .run_git(
                Some(repo_root),
                [
                    "log",
                    "--all",
                    "--date=iso-strict",
                    "--since",
                    since.as_str(),
                    "--numstat",
                    "--pretty=format:__COMMIT__%n%H%x1f%aI%x1f%an%x1f%ae%x1f%P%x1f%s",
                ],
            )
            .await?;

        let mut imported = Vec::new();
        let mut current: Option<PendingCommit> = None;
        let mut touched = Vec::new();
        let mut additions = 0_i64;
        let mut deletions = 0_i64;
        let mut files = 0_i64;

        for line in output.lines() {
            if line == "__COMMIT__" {
                if let Some((sha, authored_at_utc, author_name, author_email, is_merge, summary)) =
                    current.take()
                    && author_matches(author_emails, author_email.as_ref())
                {
                    imported.push(ImportedCommit {
                        commit: CommitEvent {
                            id: Uuid::new_v4(),
                            repo_id,
                            commit_sha: sha,
                            authored_at_utc,
                            author_name,
                            author_email,
                            summary,
                            branch: None,
                            additions,
                            deletions,
                            files_changed: files,
                            is_merge,
                            imported_at_utc: Utc::now(),
                        },
                        touched_paths: touched.clone(),
                    });
                }
                touched.clear();
                additions = 0;
                deletions = 0;
                files = 0;
                continue;
            }

            if current.is_none() {
                let mut parts = line.split('\x1f');
                let sha = parts.next().unwrap_or_default().to_string();
                let authored_at_utc =
                    DateTime::parse_from_rfc3339(parts.next().unwrap_or_default())
                        .map(|value| value.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now());
                let author_name = empty_to_none(parts.next().unwrap_or_default());
                let author_email = empty_to_none(parts.next().unwrap_or_default());
                let is_merge = parts
                    .next()
                    .map(|parents| parents.split_whitespace().count() > 1)
                    .unwrap_or(false);
                let summary = parts.next().unwrap_or_default().to_string();
                current =
                    Some((sha, authored_at_utc, author_name, author_email, is_merge, summary));
                continue;
            }

            let mut parts = line.split('\t');
            let additions_field = parts.next().unwrap_or_default();
            let deletions_field = parts.next().unwrap_or_default();
            let path = parts.next().unwrap_or_default();
            if path.is_empty() || !filter.allows(path) {
                continue;
            }
            if additions_field == "-" || deletions_field == "-" {
                continue;
            }
            let add = additions_field.parse::<i64>().unwrap_or(0);
            let del = deletions_field.parse::<i64>().unwrap_or(0);
            additions += add;
            deletions += del;
            files += 1;
            touched.push((path.to_string(), add, del));
        }

        if let Some((sha, authored_at_utc, author_name, author_email, is_merge, summary)) = current
            && author_matches(author_emails, author_email.as_ref())
        {
            imported.push(ImportedCommit {
                commit: CommitEvent {
                    id: Uuid::new_v4(),
                    repo_id,
                    commit_sha: sha,
                    authored_at_utc,
                    author_name,
                    author_email,
                    summary,
                    branch: None,
                    additions,
                    deletions,
                    files_changed: files,
                    is_merge,
                    imported_at_utc: Utc::now(),
                },
                touched_paths: touched,
            });
        }

        Ok(imported)
    }

    async fn diff_numstat(
        &self,
        repo_root: &Path,
        args: &[&str],
        filter: &PathFilter,
    ) -> Result<(DiffStats, Vec<(String, i64, i64)>)> {
        let output = self.run_git(Some(repo_root), args.iter().copied()).await?;
        let mut stats = DiffStats { additions: 0, deletions: 0, file_count: 0 };
        let mut entries = Vec::new();

        for line in output.lines() {
            let mut parts = line.split('\t');
            let additions_field = parts.next().unwrap_or_default();
            let deletions_field = parts.next().unwrap_or_default();
            let path = parts.next().unwrap_or_default();
            if path.is_empty()
                || !filter.allows(path)
                || additions_field == "-"
                || deletions_field == "-"
            {
                continue;
            }

            let additions = additions_field.parse::<i64>().unwrap_or(0);
            let deletions = deletions_field.parse::<i64>().unwrap_or(0);
            stats.additions += additions;
            stats.deletions += deletions;
            stats.file_count += 1;
            entries.push((path.to_string(), additions, deletions));
        }

        Ok((stats, entries))
    }

    async fn config_value(&self, repo_root: Option<&Path>, key: &str) -> Result<String> {
        let value = self.run_git(repo_root, ["config", "--get", key]).await?;
        Ok(value.trim().to_string())
    }

    async fn run_git<'a>(
        &self,
        repo_root: Option<&Path>,
        args: impl IntoIterator<Item = &'a str>,
    ) -> Result<String> {
        let mut command = Command::new("git");
        if let Some(repo_root) = repo_root {
            command.arg("-C").arg(repo_root);
        }
        command.args(args);
        let output = command.output().await?;
        if !output.status.success() {
            return Err(anyhow!(
                "git command failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        Ok(String::from_utf8(output.stdout)?.trim_end().to_string())
    }
}

fn parse_status(output: &str) -> (Option<String>, bool, Option<String>, i64, i64, Vec<String>) {
    let mut branch = None;
    let mut is_detached = false;
    let mut upstream_ref = None;
    let mut ahead = 0_i64;
    let mut behind = 0_i64;
    let mut untracked = Vec::new();

    for line in output.lines() {
        if let Some(value) = line.strip_prefix("# branch.head ") {
            if value == "(detached)" {
                is_detached = true;
            } else {
                branch = Some(value.to_string());
            }
        } else if let Some(value) = line.strip_prefix("# branch.upstream ") {
            upstream_ref = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("# branch.ab ") {
            let mut parts = value.split_whitespace();
            ahead = parts
                .next()
                .and_then(|value| value.strip_prefix('+'))
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(0);
            behind = parts
                .next()
                .and_then(|value| value.strip_prefix('-'))
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(0);
        } else if let Some(value) = line.strip_prefix("? ") {
            untracked.push(value.to_string());
        }
    }

    (branch, is_detached, upstream_ref, ahead, behind, untracked)
}

fn count_text_lines(path: &Path) -> Result<Option<i64>> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > 1_000_000 {
        return Ok(None);
    }
    let bytes = std::fs::read(path)?;
    if bytes.contains(&0) {
        return Ok(None);
    }
    if std::str::from_utf8(&bytes).is_err() {
        return Ok(None);
    }
    let lines = if bytes.is_empty() {
        0
    } else {
        let newline_count = bytes.iter().filter(|byte| **byte == b'\n').count() as i64;
        if bytes.last() == Some(&b'\n') { newline_count } else { newline_count + 1 }
    };
    Ok(Some(lines))
}

fn compute_repo_size(repo_root: &Path, filter: &PathFilter) -> Result<(i64, Vec<LanguageStat>)> {
    let mut total_bytes = 0_i64;
    for entry in WalkDir::new(repo_root).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(repo_root)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .replace('\\', "/");
        if !filter.allows(&relative) {
            continue;
        }
        total_bytes += entry.metadata()?.len() as i64;
    }

    let mut languages = Languages::new();
    languages.get_statistics(&[repo_root.to_path_buf()], &[], &TokeiConfig::default());
    let mut breakdown = BTreeSet::new();
    let mut stats = Vec::new();
    for (language, reports) in languages {
        let mut code = 0_i64;
        let mut comments = 0_i64;
        let mut blanks = 0_i64;
        for report in reports.reports {
            let relative = report
                .name
                .strip_prefix(repo_root)
                .unwrap_or(&report.name)
                .to_string_lossy()
                .replace('\\', "/");
            if !filter.allows(&relative) || !breakdown.insert(relative) {
                continue;
            }
            code += report.stats.code as i64;
            comments += report.stats.comments as i64;
            blanks += report.stats.blanks as i64;
        }
        if code + comments + blanks > 0 {
            stats.push(LanguageStat {
                language: language.name().to_string(),
                code,
                comments,
                blanks,
            });
        }
    }
    stats.sort_by(|left, right| {
        (right.code + right.comments + right.blanks).cmp(&(left.code + left.comments + left.blanks))
    });
    Ok((total_bytes, stats))
}

fn empty_to_none(value: &str) -> Option<String> {
    if value.trim().is_empty() { None } else { Some(value.to_string()) }
}

fn author_matches(author_emails: &[String], author_email: Option<&String>) -> bool {
    author_emails.is_empty()
        || author_email
            .map(|email| author_emails.iter().any(|allowed| allowed == email))
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::parse_status;

    #[test]
    fn parses_porcelain_v2_branch_info() {
        let sample =
            "# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n? scratch.txt\n";
        let (branch, detached, upstream, ahead, behind, untracked) = parse_status(sample);
        assert_eq!(branch.as_deref(), Some("main"));
        assert!(!detached);
        assert_eq!(upstream.as_deref(), Some("origin/main"));
        assert_eq!(ahead, 2);
        assert_eq!(behind, 1);
        assert_eq!(untracked, vec!["scratch.txt"]);
    }
}
