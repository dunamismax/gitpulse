from __future__ import annotations

from typing import Any, cast

import httpx

from .models import (
    AchievementsResponse,
    ActionResult,
    DashboardView,
    RepoDetailView,
    RepositoryCard,
    SaveSettingsRequest,
    SessionSummary,
    SettingsResponse,
)


class GitPulseAPIError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        kind: str = "http_error",
        base_url: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.kind = kind
        self.base_url = base_url


class GitPulseAPI:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def dashboard(self) -> DashboardView:
        data = await self._get_json("/api/dashboard")
        return DashboardView.model_validate(data)

    async def repositories(self) -> list[RepositoryCard]:
        data = await self._get_json("/api/repositories")
        return [RepositoryCard.model_validate(item) for item in data]

    async def repo_detail(self, repo_id: str) -> RepoDetailView:
        data = await self._get_json(f"/api/repositories/{repo_id}")
        return RepoDetailView.model_validate(data)

    async def sessions(self) -> SessionSummary:
        data = await self._get_json("/api/sessions")
        return SessionSummary.model_validate(data)

    async def achievements(self) -> AchievementsResponse:
        data = await self._get_json("/api/achievements")
        return AchievementsResponse.model_validate(data)

    async def settings(self) -> SettingsResponse:
        data = await self._get_json("/api/settings")
        return SettingsResponse.model_validate(data)

    async def add_target(self, path: str) -> None:
        await self._post_json("/api/repositories/add", {"path": path})

    async def refresh_repo(self, repo_id: str) -> None:
        await self._post_json(f"/api/repositories/{repo_id}/refresh")

    async def toggle_repo(self, repo_id: str) -> None:
        await self._post_json(f"/api/repositories/{repo_id}/toggle")

    async def remove_repo(self, repo_id: str) -> None:
        await self._post_json(f"/api/repositories/{repo_id}/remove")

    async def save_repo_patterns(
        self,
        repo_id: str,
        *,
        include_patterns: list[str],
        exclude_patterns: list[str],
    ) -> None:
        await self._post_json(
            f"/api/repositories/{repo_id}/patterns",
            {
                "include_patterns": include_patterns,
                "exclude_patterns": exclude_patterns,
            },
        )

    async def save_settings(self, payload: SaveSettingsRequest) -> None:
        await self._post_json("/api/settings", payload.model_dump())

    async def import_repo(self, repo_id: str, *, days: int) -> ActionResult:
        data = await self._post_json(f"/api/repositories/{repo_id}/import", {"days": days})
        return ActionResult.model_validate(data)

    async def run_import(self, *, days: int) -> ActionResult:
        data = await self._post_json("/api/actions/import", {"days": days})
        return ActionResult.model_validate(data)

    async def run_rescan(self) -> ActionResult:
        data = await self._post_json("/api/actions/rescan")
        return ActionResult.model_validate(data)

    async def run_rebuild(self) -> ActionResult:
        data = await self._post_json("/api/actions/rebuild")
        return ActionResult.model_validate(data)

    async def _get_json(self, path: str) -> Any:
        response = await self._request("GET", path)
        return await self._decode_response(response)

    async def _post_json(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        response = await self._request("POST", path, json=payload)
        return await self._decode_response(response)

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            return await self._client.request(method, path, **kwargs)
        except httpx.ConnectError as exc:
            raise GitPulseAPIError(
                _build_transport_message(
                    self._base_url,
                    "Could not reach the GitPulse backend.",
                ),
                kind="backend_unreachable",
                base_url=self._base_url,
            ) from exc
        except httpx.TimeoutException as exc:
            raise GitPulseAPIError(
                _build_transport_message(
                    self._base_url,
                    "The GitPulse backend did not respond before the request timed out.",
                ),
                kind="backend_timeout",
                base_url=self._base_url,
            ) from exc
        except httpx.RequestError as exc:
            raise GitPulseAPIError(
                _build_transport_message(
                    self._base_url,
                    f"GitPulse backend request failed before a response was received: {exc!s}.",
                ),
                kind="backend_transport",
                base_url=self._base_url,
            ) from exc

    async def _decode_response(self, response: httpx.Response) -> Any:
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            message = _extract_error_message(exc.response)
            raise GitPulseAPIError(
                message,
                status_code=exc.response.status_code,
                kind="http_error",
                base_url=self._base_url,
            ) from exc

        if not response.content:
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise GitPulseAPIError(
                (
                    "GitPulse backend returned an unreadable response. "
                    f"Expected JSON from {self._base_url}."
                ),
                kind="backend_response",
                base_url=self._base_url,
            ) from exc

    @property
    def _base_url(self) -> str:
        return str(self._client.base_url).rstrip("/")


def _extract_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return f"GitPulse backend error: {response.status_code} {response.reason_phrase}"

    if isinstance(payload, dict):
        payload_dict = cast(dict[str, Any], payload)
        error = payload_dict.get("error")
        if isinstance(error, str):
            return error
    return f"GitPulse backend error: {response.status_code} {response.reason_phrase}"


def _build_transport_message(base_url: str, prefix: str) -> str:
    return (
        f"{prefix} GitPulse UI is configured to call {base_url}. "
        "Start the Go server with `go run ./cmd/gitpulse serve`, or set "
        "`GITPULSE_UI_API_BASE_URL` to the correct origin."
    )
