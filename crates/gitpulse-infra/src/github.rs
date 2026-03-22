use anyhow::{Result, anyhow};
use reqwest::{Client, StatusCode};
use url::Url;

#[derive(Clone)]
pub struct GithubVerifier {
    client: Client,
}

impl Default for GithubVerifier {
    fn default() -> Self {
        Self { client: Client::new() }
    }
}

impl GithubVerifier {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn verify_commit(
        &self,
        remote_url: &str,
        sha: &str,
        token: &str,
    ) -> Result<Option<String>> {
        let Some((owner, repo)) = parse_github_remote(remote_url) else {
            return Ok(None);
        };
        let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/{sha}");
        let response =
            self.client.get(url).bearer_auth(token).header("User-Agent", "gitpulse").send().await?;

        match response.status() {
            StatusCode::OK => Ok(Some("remote confirmation succeeded".into())),
            StatusCode::NOT_FOUND => Ok(None),
            status => Err(anyhow!("github verification failed with status {status}")),
        }
    }
}

fn parse_github_remote(remote: &str) -> Option<(String, String)> {
    if let Some(rest) = remote.strip_prefix("git@github.com:") {
        return split_owner_repo(rest);
    }
    let url = Url::parse(remote).ok()?;
    if url.host_str()? != "github.com" {
        return None;
    }
    split_owner_repo(url.path().trim_start_matches('/'))
}

fn split_owner_repo(value: &str) -> Option<(String, String)> {
    let trimmed = value.trim_end_matches(".git");
    let mut segments = trimmed.split('/');
    let owner = segments.next()?.to_string();
    let repo = segments.next()?.to_string();
    Some((owner, repo))
}

#[cfg(test)]
mod tests {
    use super::parse_github_remote;

    #[test]
    fn parses_https_and_ssh_remotes() {
        assert_eq!(
            parse_github_remote("https://github.com/example/project.git"),
            Some(("example".into(), "project".into()))
        );
        assert_eq!(
            parse_github_remote("git@github.com:example/project.git"),
            Some(("example".into(), "project".into()))
        );
    }

    #[test]
    fn unsupported_remote_formats_fail_open() {
        assert_eq!(parse_github_remote("git@github.com-dunamismax:example/project.git"), None);
        assert_eq!(parse_github_remote("ssh://codeberg.org/example/project.git"), None);
    }
}
