from __future__ import annotations

import asyncio

import httpx
import pytest

from gitpulse_ui.service import GitPulseAPI, GitPulseAPIError


def test_connect_error_becomes_actionable_backend_unavailable_error() -> None:
    async def exercise() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(
            base_url="http://127.0.0.1:7467",
            transport=transport,
        ) as client:
            api = GitPulseAPI(client)
            with pytest.raises(GitPulseAPIError) as exc_info:
                await api.dashboard()

        assert exc_info.value.kind == "backend_unreachable"
        assert "http://127.0.0.1:7467" in exc_info.value.message
        assert "go run ./cmd/gitpulse serve" in exc_info.value.message
        assert "GITPULSE_UI_API_BASE_URL" in exc_info.value.message

    asyncio.run(exercise())


def test_invalid_json_becomes_backend_response_error() -> None:
    async def exercise() -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=200,
                text="not-json",
                headers={"Content-Type": "text/plain"},
            )

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(
            base_url="http://127.0.0.1:7467",
            transport=transport,
        ) as client:
            api = GitPulseAPI(client)
            with pytest.raises(GitPulseAPIError) as exc_info:
                await api.dashboard()

        assert exc_info.value.kind == "backend_response"
        assert "unreadable response" in exc_info.value.message
        assert "http://127.0.0.1:7467" in exc_info.value.message

    asyncio.run(exercise())


def test_enveloped_contracts_are_unwrapped_for_frontend_models() -> None:
    async def exercise() -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/api/dashboard":
                return httpx.Response(
                    status_code=200,
                    json={
                        "data": {
                            "summary": {
                                "live_lines": 12,
                                "staged_lines": 4,
                                "commits_today": 1,
                                "pushes_today": 0,
                                "active_session_minutes": 30,
                                "streak_days": 2,
                                "best_streak_days": 5,
                                "today_score": 42,
                                "goals": [],
                            },
                            "trend_points": [],
                            "heatmap_days": [],
                            "activity_feed": [],
                            "repo_cards": [],
                        }
                    },
                )

            if request.url.path == "/api/repositories":
                return httpx.Response(
                    status_code=200,
                    json={
                        "data": {
                            "repositories": [
                                {
                                    "repo": {
                                        "id": "repo-1",
                                        "name": "example-repo",
                                        "root_path": "/tmp/example",
                                        "is_monitored": True,
                                        "state": "active",
                                    },
                                    "health": "Healthy",
                                    "metrics": None,
                                    "sparkline": [],
                                    "snapshot": None,
                                }
                            ]
                        }
                    },
                )

            if request.url.path == "/api/actions/rebuild":
                return httpx.Response(
                    status_code=200,
                    json={
                        "data": {
                            "result": {
                                "action": "rebuild_analytics",
                                "title": "Analytics rebuild finished",
                                "summary": "Rebuilt sessions, rollups, and achievements in 95ms.",
                                "lines": ["Sessions written: 3"],
                                "warnings": [],
                            }
                        }
                    },
                )

            return httpx.Response(status_code=404, json={"error": "not found"})

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(
            base_url="http://127.0.0.1:7467",
            transport=transport,
        ) as client:
            api = GitPulseAPI(client)

            dashboard = await api.dashboard()
            repositories = await api.repositories()
            rebuild = await api.run_rebuild()

        assert dashboard.summary.today_score == 42
        assert len(repositories) == 1
        assert repositories[0].repo.name == "example-repo"
        assert rebuild.action == "rebuild_analytics"
        assert rebuild.title == "Analytics rebuild finished"

    asyncio.run(exercise())
