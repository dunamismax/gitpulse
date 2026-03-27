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
