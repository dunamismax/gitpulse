from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from gitpulse_ui.app import create_app
from gitpulse_ui.models import (
    AchievementsResponse,
    ActionResult,
    DashboardView,
    RepoDetailView,
    RepositoryCard,
    SaveSettingsRequest,
    SessionSummary,
    SettingsResponse,
)
from gitpulse_ui.service import GitPulseAPIError
from gitpulse_ui.settings import UISettings


class FakeService:
    def __init__(self) -> None:
        self.added_targets: list[str] = []
        self.refreshed_repo_ids: list[str] = []
        self.toggled_repo_ids: list[str] = []
        self.removed_repo_ids: list[str] = []
        self.saved_patterns: list[tuple[str, list[str], list[str]]] = []
        self.saved_settings: list[SaveSettingsRequest] = []
        self.imported_repo_requests: list[tuple[str, int]] = []
        self.import_runs: list[int] = []
        self.rescan_runs = 0
        self.rebuild_runs = 0

    async def dashboard(self) -> DashboardView:
        return DashboardView.model_validate(sample_dashboard_payload())

    async def repositories(self) -> list[RepositoryCard]:
        return [RepositoryCard.model_validate(sample_repo_card_payload())]

    async def repo_detail(self, repo_id: str) -> RepoDetailView:
        payload = sample_repo_detail_payload()
        payload["card"]["repo"]["id"] = repo_id
        return RepoDetailView.model_validate(payload)

    async def sessions(self) -> SessionSummary:
        return SessionSummary.model_validate(sample_sessions_payload())

    async def achievements(self) -> AchievementsResponse:
        return AchievementsResponse.model_validate(sample_achievements_payload())

    async def settings(self) -> SettingsResponse:
        return SettingsResponse.model_validate(sample_settings_payload())

    async def add_target(self, path: str) -> None:
        self.added_targets.append(path)

    async def refresh_repo(self, repo_id: str) -> None:
        self.refreshed_repo_ids.append(repo_id)

    async def toggle_repo(self, repo_id: str) -> None:
        self.toggled_repo_ids.append(repo_id)

    async def remove_repo(self, repo_id: str) -> None:
        self.removed_repo_ids.append(repo_id)

    async def save_repo_patterns(
        self,
        repo_id: str,
        *,
        include_patterns: list[str],
        exclude_patterns: list[str],
    ) -> None:
        self.saved_patterns.append((repo_id, include_patterns, exclude_patterns))

    async def save_settings(self, payload: SaveSettingsRequest) -> None:
        self.saved_settings.append(payload)

    async def import_repo(self, repo_id: str, *, days: int) -> ActionResult:
        self.imported_repo_requests.append((repo_id, days))
        return sample_action_result(
            "import_repo",
            f"Imported 3 commits for {repo_id} in 120ms.",
            title="Repository import finished",
        )

    async def run_import(self, *, days: int) -> ActionResult:
        self.import_runs.append(days)
        return sample_action_result(
            "import_all",
            "Imported 5 commits across 1 repository in 220ms.",
            title="History import finished",
        )

    async def run_rescan(self) -> ActionResult:
        self.rescan_runs += 1
        return sample_action_result(
            "rescan_all",
            "Rescanned 1 active repository in 180ms.",
            title="Repository rescan finished",
        )

    async def run_rebuild(self) -> ActionResult:
        self.rebuild_runs += 1
        return sample_action_result(
            "rebuild_analytics",
            "Rebuilt sessions, rollups, and achievements in 95ms.",
            title="Analytics rebuild finished",
        )


class BackendUnavailableService(FakeService):
    async def dashboard(self) -> DashboardView:
        raise GitPulseAPIError(
            (
                "Could not reach the GitPulse backend. GitPulse UI is configured to call "
                "http://127.0.0.1:7467. Start the Go server with `go run ./cmd/gitpulse serve`, "
                "or set `GITPULSE_UI_API_BASE_URL` to the correct origin."
            ),
            kind="backend_unreachable",
            base_url="http://127.0.0.1:7467",
        )


class ZeroStateService(FakeService):
    async def dashboard(self) -> DashboardView:
        return DashboardView.model_validate(sample_empty_dashboard_payload())

    async def repositories(self) -> list[RepositoryCard]:
        return []

    async def repo_detail(self, repo_id: str) -> RepoDetailView:
        payload = sample_repo_detail_payload()
        payload["card"] = {
            **payload["card"],
            "repo": {
                **payload["card"]["repo"],
                "id": repo_id,
                "name": "empty-repo",
            },
            "snapshot": None,
            "metrics": {"commits": 0, "pushes": 0, "files_touched": 0, "score": 0},
        }
        payload["recent_commits"] = []
        payload["recent_pushes"] = []
        payload["recent_sessions"] = []
        payload["language_breakdown"] = []
        payload["top_files"] = []
        return RepoDetailView.model_validate(payload)

    async def sessions(self) -> SessionSummary:
        payload = sample_sessions_payload()
        payload["sessions"] = []
        payload["total_minutes"] = 0
        payload["average_length_minutes"] = 0
        payload["longest_session_minutes"] = 0
        return SessionSummary.model_validate(payload)

    async def achievements(self) -> AchievementsResponse:
        payload = sample_achievements_payload()
        payload["achievements"] = []
        payload["today_score"] = 0
        payload["streaks"] = {"current_days": 0, "best_days": 0}
        return AchievementsResponse.model_validate(payload)


def build_client(service: FakeService | None = None) -> tuple[TestClient, FakeService]:
    fake = service or FakeService()
    app = create_app(settings=UISettings(api_base_url="http://example.test"), service=fake)
    return TestClient(app), fake


def test_dashboard_page_renders_summary_and_repo_cards() -> None:
    client, _ = build_client()

    response = client.get("/")

    assert response.status_code == 200
    assert "What are you changing right now?" in response.text
    assert "example-repo" in response.text
    assert "Live Lines" in response.text
    assert "Add first widget" in response.text
    assert "Last Snapshot" in response.text
    assert "2026-03-27 08:30" in response.text
    assert "/static/vendor/alpine.js" in response.text
    assert "/static/vendor/htmx.js" in response.text
    assert "unpkg.com" not in response.text


def test_repositories_page_renders_add_form_and_card() -> None:
    client, _ = build_client()

    response = client.get("/repositories")

    assert response.status_code == 200
    assert "Add Target" in response.text
    assert "example-repo" in response.text
    assert "All Repositories" in response.text
    assert "Operator Runbook" in response.text
    assert "Import Recent History" in response.text


def test_zero_state_pages_render_first_run_guidance() -> None:
    client, _ = build_client(ZeroStateService())

    dashboard = client.get("/")
    repositories = client.get("/repositories")
    sessions = client.get("/sessions")
    achievements = client.get("/achievements")

    assert dashboard.status_code == 200
    assert "First Run Guide" in dashboard.text
    assert "Fresh database detected" in dashboard.text
    assert repositories.status_code == 200
    assert "No repositories tracked yet" in repositories.text
    assert sessions.status_code == 200
    assert "Run rebuild analytics" in sessions.text
    assert achievements.status_code == 200
    assert "No achievements yet" in achievements.text


def test_repositories_add_htmx_updates_section_and_calls_backend() -> None:
    client, service = build_client()

    response = client.post(
        "/repositories/add",
        data={"path": "/Users/sawyer/code"},
        headers={"HX-Request": "true"},
    )

    assert response.status_code == 200
    assert service.added_targets == ["/Users/sawyer/code"]
    assert "Target added." in response.text
    assert "repositories-section" in response.text


def test_action_center_runs_import_and_returns_summary_partial() -> None:
    client, service = build_client()

    response = client.post(
        "/actions/import",
        data={"days": "14", "return_to": "/repositories"},
        headers={"HX-Request": "true"},
    )

    assert response.status_code == 200
    assert service.import_runs == [14]
    assert "History import finished" in response.text
    assert "Imported 5 commits across 1 repository" in response.text


def test_repository_detail_renders_commits_and_patterns() -> None:
    client, _ = build_client()

    response = client.get("/repositories/repo-123")

    assert response.status_code == 200
    assert "Repository detail" in response.text
    assert "Improve importer" in response.text
    assert "src/**" in response.text
    assert "Recent Pushes" in response.text
    assert "Detected locally" in response.text
    assert "+2 / -1" in response.text
    assert "Top Files Touched" in response.text
    assert "Import 30 Day History" in response.text


def test_repository_detail_empty_state_and_import_post() -> None:
    client, service = build_client(ZeroStateService())

    response = client.get("/repositories/repo-empty")

    assert response.status_code == 200
    assert "Repository still being backfilled" in response.text
    assert "Use the import button above" in response.text

    post_response = client.post(
        "/repositories/repo-empty/import",
        data={"days": "21"},
        follow_redirects=False,
    )

    assert post_response.status_code == 303
    assert post_response.headers["location"].startswith("/repositories/repo-empty?")
    assert service.imported_repo_requests == [("repo-empty", 21)]


def test_dashboard_page_renders_backend_guidance_when_api_is_unreachable() -> None:
    client, _ = build_client(BackendUnavailableService())

    response = client.get("/")

    assert response.status_code == 503
    assert "GitPulse backend unavailable" in response.text
    assert "http://127.0.0.1:7467" in response.text
    assert "go run ./cmd/gitpulse serve" in response.text
    assert "GITPULSE_UI_API_BASE_URL" in response.text


def test_settings_post_redirects_and_forwards_payload() -> None:
    client, service = build_client()

    response = client.post(
        "/settings",
        data={
            "authors": "dev@example.com\nalt@example.com",
            "changed_lines_per_day": "250",
            "commits_per_day": "3",
            "focus_minutes_per_day": "90",
            "timezone": "America/New_York",
            "day_boundary_minutes": "120",
            "session_gap_minutes": "15",
            "import_days": "30",
            "include_patterns": "src/**\ndocs/**",
            "exclude_patterns": "generated/**",
            "github_enabled": "on",
            "github_verify_remote_pushes": "on",
            "github_token": "",
        },
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"].startswith("/settings?")
    assert len(service.saved_settings) == 1
    payload = service.saved_settings[0]
    assert payload.authors == ["dev@example.com", "alt@example.com"]
    assert payload.include_patterns == ["src/**", "docs/**"]
    assert payload.exclude_patterns == ["generated/**"]
    assert payload.github_enabled is True
    assert payload.github_verify_remote_pushes is True


def test_sessions_and_achievements_pages_render() -> None:
    client, _ = build_client()

    sessions_response = client.get("/sessions")
    achievements_response = client.get("/achievements")

    assert sessions_response.status_code == 200
    assert "Session rhythm" in sessions_response.text
    assert "75 min" in sessions_response.text

    assert achievements_response.status_code == 200
    assert "Consistency, not gimmicks" in achievements_response.text
    assert "first_repo" in achievements_response.text


def sample_action_result(action: str, summary: str, *, title: str | None = None) -> ActionResult:
    return ActionResult.model_validate(
        {
            "action": action,
            "title": title or (action.replace("_", " ").title() + " finished"),
            "summary": summary,
            "lines": ["Repositories processed: 1", "Commits imported: 5"],
            "warnings": [],
        }
    )


def sample_repo_card_payload() -> dict[str, Any]:
    return {
        "repo": {
            "id": "repo-123",
            "name": "example-repo",
            "root_path": "/Users/sawyer/code/example-repo",
            "is_monitored": True,
            "state": "active",
            "updated_at": iso_now(),
        },
        "health": "Healthy",
        "metrics": {"commits": 4, "pushes": 1, "files_touched": 7, "score": 84},
        "sparkline": [12, 16, 22, 8],
        "snapshot": {
            "observed_at": iso_now(),
            "branch": "main",
            "upstream_ref": "origin/main",
            "ahead_count": 2,
            "behind_count": 1,
            "live_additions": 12,
            "live_deletions": 4,
            "live_files": 3,
            "staged_additions": 8,
            "staged_deletions": 2,
            "staged_files": 1,
        },
    }


def sample_dashboard_payload() -> dict[str, Any]:
    return {
        "summary": {
            "live_lines": 16,
            "staged_lines": 10,
            "commits_today": 2,
            "pushes_today": 1,
            "active_session_minutes": 75,
            "streak_days": 4,
            "best_streak_days": 9,
            "today_score": 84,
            "goals": [
                {"label": "Changed Lines", "current": 120, "target": 250, "percent": 48.0},
                {"label": "Commits", "current": 2, "target": 3, "percent": 66.6},
            ],
        },
        "trend_points": [
            {"day": "2026-03-24", "changed_lines": 80, "score": 33},
            {"day": "2026-03-25", "changed_lines": 120, "score": 54},
            {"day": "2026-03-26", "changed_lines": 200, "score": 84},
        ],
        "heatmap_days": [
            {"day": "2026-03-20", "changed_lines": 20, "score": 18},
            {"day": "2026-03-21", "changed_lines": 40, "score": 42},
        ],
        "activity_feed": [
            {
                "kind": "commit",
                "repo_name": "example-repo",
                "timestamp": iso_now(),
                "detail": "Add first widget",
            }
        ],
        "repo_cards": [sample_repo_card_payload()],
    }


def sample_empty_dashboard_payload() -> dict[str, Any]:
    return {
        "summary": {
            "live_lines": 0,
            "staged_lines": 0,
            "commits_today": 0,
            "pushes_today": 0,
            "active_session_minutes": 0,
            "streak_days": 0,
            "best_streak_days": 0,
            "today_score": 0,
            "goals": [],
        },
        "trend_points": [],
        "heatmap_days": [],
        "activity_feed": [],
        "repo_cards": [],
    }


def sample_repo_detail_payload() -> dict[str, Any]:
    return {
        "card": sample_repo_card_payload(),
        "include_patterns": ["src/**"],
        "exclude_patterns": ["generated/**"],
        "recent_commits": [
            {
                "id": "commit-1",
                "commit_sha": "abcdef1234567890",
                "summary": "Improve importer",
                "additions": 24,
                "deletions": 5,
                "authored_at": iso_now(),
            }
        ],
        "recent_pushes": [
            {
                "id": "push-1",
                "observed_at": iso_now(),
                "kind": "push_detected_local",
                "head_sha": "abcdef1234567890",
                "pushed_commit_count": 2,
                "upstream_ref": "origin/main",
                "notes": "push detected",
            }
        ],
        "recent_sessions": [
            {
                "id": "session-1",
                "started_at": iso_now(),
                "ended_at": iso_now(),
                "active_minutes": 75,
                "total_changed_lines": 88,
            }
        ],
        "language_breakdown": [{"language": "Go", "code": 530}],
        "top_files": ["internal/runtime/runtime.go", "internal/web/server.go"],
    }


def sample_sessions_payload() -> dict[str, Any]:
    return {
        "sessions": [
            {
                "id": "session-1",
                "started_at": iso_now(),
                "ended_at": iso_now(),
                "active_minutes": 75,
                "total_changed_lines": 88,
            }
        ],
        "total_minutes": 75,
        "average_length_minutes": 75,
        "longest_session_minutes": 75,
    }


def sample_achievements_payload() -> dict[str, Any]:
    return {
        "achievements": [
            {
                "kind": "first_repo",
                "reason": "Tracked your first repository.",
                "unlocked_at": iso_now(),
                "day": "2026-03-26",
            }
        ],
        "streaks": {"current_days": 4, "best_days": 9},
        "today_score": 84,
    }


def sample_settings_payload() -> dict[str, Any]:
    return {
        "config": {
            "authors": [{"email": "dev@example.com"}],
            "goals": {
                "changed_lines_per_day": 250,
                "commits_per_day": 3,
                "focus_minutes_per_day": 90,
            },
            "monitoring": {"session_gap_minutes": 15, "import_days": 30},
            "ui": {"timezone": "UTC", "day_boundary_minutes": 0},
            "patterns": {"include": ["src/**"], "exclude": ["generated/**"]},
            "github": {"enabled": True, "verify_remote_pushes": False},
        },
        "paths": {
            "config_file": "/Users/sawyer/Library/Application Support/gitpulse/gitpulse.toml",
            "config_dir": "/Users/sawyer/Library/Application Support/gitpulse",
            "data_dir": "/Users/sawyer/Library/Application Support/gitpulse/data",
        },
    }


def iso_now() -> str:
    return datetime(2026, 3, 27, 8, 30, tzinfo=UTC).isoformat()
