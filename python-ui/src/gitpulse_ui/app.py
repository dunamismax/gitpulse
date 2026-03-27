from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Protocol, cast
from urllib.parse import urlencode

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .models import (
    ActionResult,
    DashboardView,
    RepoDetailView,
    RepositoryCard,
    SaveSettingsRequest,
    SettingsResponse,
)
from .service import GitPulseAPI, GitPulseAPIError
from .settings import UISettings, get_settings

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


class GitPulseService(Protocol):
    async def dashboard(self) -> DashboardView: ...
    async def repositories(self) -> list[RepositoryCard]: ...
    async def repo_detail(self, repo_id: str) -> RepoDetailView: ...
    async def sessions(self) -> Any: ...
    async def achievements(self) -> Any: ...
    async def settings(self) -> SettingsResponse: ...
    async def add_target(self, path: str) -> None: ...
    async def refresh_repo(self, repo_id: str) -> None: ...
    async def toggle_repo(self, repo_id: str) -> None: ...
    async def remove_repo(self, repo_id: str) -> None: ...
    async def save_repo_patterns(
        self,
        repo_id: str,
        *,
        include_patterns: list[str],
        exclude_patterns: list[str],
    ) -> None: ...
    async def save_settings(self, payload: SaveSettingsRequest) -> None: ...
    async def import_repo(self, repo_id: str, *, days: int) -> ActionResult: ...
    async def run_import(self, *, days: int) -> ActionResult: ...
    async def run_rescan(self) -> ActionResult: ...
    async def run_rebuild(self) -> ActionResult: ...


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = cast(UISettings, app.state.settings)
    if getattr(app.state, "service", None) is None:
        client = httpx.AsyncClient(base_url=settings.api_base_url, timeout=20.0)
        app.state.http_client = client
        app.state.service = GitPulseAPI(client)
    try:
        yield
    finally:
        client = getattr(app.state, "http_client", None)
        if client is not None:
            await client.aclose()


def create_app(
    *,
    settings: UISettings | None = None,
    service: GitPulseService | None = None,
) -> FastAPI:
    ui_settings = settings or get_settings()
    app = FastAPI(title=ui_settings.app_name, lifespan=_lifespan)
    app.state.settings = ui_settings
    if service is not None:
        app.state.service = service

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/", response_class=HTMLResponse)
    async def dashboard(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        try:
            view = await svc.dashboard()
        except GitPulseAPIError as exc:
            action_panel = await _action_panel_context(request, svc, return_to="/")
            return _render(
                request,
                "dashboard.html",
                {
                    **_page_meta(
                        active_nav="dashboard",
                        eyebrow="Today",
                        heading="What are you changing right now?",
                        description=(
                            "GitPulse keeps live work, committed work, and pushed work separate "
                            "so the signal stays honest."
                        ),
                        error=exc.message,
                        backend_status=_backend_status(request, exc),
                    ),
                    "view": None,
                    **action_panel,
                },
                status_code=_status_code_for_error(exc),
            )

        action_panel = await _action_panel_context(
            request,
            svc,
            return_to="/",
            tracked_total=len(view.repo_cards),
        )
        return _render(
            request,
            "dashboard.html",
            {
                **_page_meta(
                    active_nav="dashboard",
                    eyebrow="Today",
                    heading="What are you changing right now?",
                    description=(
                        "GitPulse keeps live work, committed work, and pushed work separate so "
                        "the signal stays honest."
                    ),
                    flash=_flash_from_query(request),
                ),
                "view": view,
                **action_panel,
            },
        )

    @app.get("/repositories", response_class=HTMLResponse)
    async def repositories_page(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        cards, error = await _load_repositories(svc)
        action_panel = await _action_panel_context(
            request,
            svc,
            return_to="/repositories",
            tracked_total=len(cards),
        )
        return _render(
            request,
            "repositories.html",
            {
                **_page_meta(
                    active_nav="repositories",
                    eyebrow="Tracked Targets",
                    heading="Repositories",
                    description=(
                        "Add a single repo or a parent folder. Nested repos are discovered and "
                        "tracked individually."
                    ),
                    flash=_flash_from_query(request),
                    error=error.message if error else None,
                    backend_status=_backend_status(request, error),
                ),
                "cards": cards,
                "path_value": "",
                **action_panel,
            },
            status_code=_status_code_for_error(error),
        )

    @app.post("/repositories/add", response_class=HTMLResponse)
    async def repositories_add(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        path_value = str(form.get("path", "")).strip()
        message: str | None = None
        level = "success"
        error: str | None = None
        error_exc: GitPulseAPIError | None = None

        if not path_value:
            error = "Path is required."
        else:
            try:
                await svc.add_target(path_value)
                message = "Target added."
                path_value = ""
            except GitPulseAPIError as exc:
                error = exc.message
                error_exc = exc

        cards, load_error = await _load_repositories(svc)
        if error is None and load_error is not None:
            error = load_error.message
            error_exc = load_error
        elif error_exc is None:
            error_exc = load_error

        if _is_htmx(request):
            return _render(
                request,
                "partials/repository_section.html",
                {
                    "cards": cards,
                    "message": message,
                    "level": level,
                    "error": error,
                    "backend_status": _backend_status(request, error_exc),
                    "inline_backend_status": True,
                },
                status_code=(
                    200 if error is None else _status_code_for_error(error_exc, default=400)
                ),
            )

        if error:
            action_panel = await _action_panel_context(
                request,
                svc,
                return_to="/repositories",
                tracked_total=len(cards),
            )
            return _render(
                request,
                "repositories.html",
                {
                    **_page_meta(
                        active_nav="repositories",
                        eyebrow="Tracked Targets",
                        heading="Repositories",
                        description=(
                            "Add a single repo or a parent folder. Nested repos are discovered and "
                            "tracked individually."
                        ),
                        error=error,
                        backend_status=_backend_status(request, error_exc),
                    ),
                    "cards": cards,
                    "path_value": str(form.get("path", "")),
                    **action_panel,
                },
                status_code=_status_code_for_error(error_exc, default=400),
            )

        return _redirect_with_flash("/repositories", "Target added.")

    @app.post("/repositories/{repo_id}/refresh", response_class=HTMLResponse)
    async def repositories_refresh(
        repo_id: str,
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        return await _mutate_repositories(
            request,
            svc,
            action=lambda: svc.refresh_repo(repo_id),
            success_message="Repository rescanned.",
            redirect_to=f"/repositories/{repo_id}",
        )

    @app.post("/repositories/{repo_id}/import", response_class=HTMLResponse)
    async def repositories_import(
        repo_id: str,
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        days = _parse_positive_int(form.get("days"), fallback=30)

        try:
            result = await svc.import_repo(repo_id, days=days)
        except GitPulseAPIError as exc:
            return _redirect_with_flash(
                f"/repositories/{repo_id}",
                exc.message,
                level="error",
            )

        return _redirect_with_flash(f"/repositories/{repo_id}", result.summary)

    @app.post("/repositories/{repo_id}/toggle", response_class=HTMLResponse)
    async def repositories_toggle(
        repo_id: str,
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        return await _mutate_repositories(
            request,
            svc,
            action=lambda: svc.toggle_repo(repo_id),
            success_message="Monitoring state updated.",
            redirect_to="/repositories",
        )

    @app.post("/repositories/{repo_id}/remove", response_class=HTMLResponse)
    async def repositories_remove(
        repo_id: str,
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        return await _mutate_repositories(
            request,
            svc,
            action=lambda: svc.remove_repo(repo_id),
            success_message="Repository removed.",
            redirect_to="/repositories",
        )

    @app.get("/repositories/{repo_id}", response_class=HTMLResponse)
    async def repository_detail(
        repo_id: str,
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        import_days = await _load_import_days(svc)
        try:
            view = await svc.repo_detail(repo_id)
        except GitPulseAPIError as exc:
            return _render(
                request,
                "repository_detail.html",
                {
                    **_page_meta(
                        active_nav="repositories",
                        eyebrow="Repository Detail",
                        heading="Repository detail",
                        description=(
                            "Repository-specific filters, health, sessions, and imported history."
                        ),
                        error=exc.message,
                        backend_status=_backend_status(request, exc),
                    ),
                    "view": None,
                    "include_patterns_value": "",
                    "exclude_patterns_value": "",
                    "repo_import_days": import_days,
                },
                status_code=_status_code_for_error(exc, default=502),
            )

        return _render(
            request,
            "repository_detail.html",
            {
                **_page_meta(
                    active_nav="repositories",
                    eyebrow="Repository Detail",
                    heading="Repository detail",
                    description=(
                        "Repository-specific filters, health, sessions, and imported history."
                    ),
                    flash=_flash_from_query(request),
                ),
                "view": view,
                "include_patterns_value": "\n".join(view.include_patterns),
                "exclude_patterns_value": "\n".join(view.exclude_patterns),
                "repo_import_days": import_days,
            },
        )

    @app.post("/repositories/{repo_id}/patterns", response_class=HTMLResponse)
    async def repository_patterns(
        repo_id: str,
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        include_patterns = _split_lines(str(form.get("include_patterns", "")))
        exclude_patterns = _split_lines(str(form.get("exclude_patterns", "")))

        try:
            await svc.save_repo_patterns(
                repo_id,
                include_patterns=include_patterns,
                exclude_patterns=exclude_patterns,
            )
        except GitPulseAPIError as exc:
            view, load_error = await _load_repo_detail(svc, repo_id)
            import_days = await _load_import_days(svc)
            combined_error = (
                exc.message if load_error is None else f"{exc.message} {load_error.message}"
            )
            return _render(
                request,
                "repository_detail.html",
                {
                    **_page_meta(
                        active_nav="repositories",
                        eyebrow="Repository Detail",
                        heading="Repository detail",
                        description=(
                            "Repository-specific filters, health, sessions, and imported history."
                        ),
                        error=combined_error,
                        backend_status=_backend_status(request, load_error or exc),
                    ),
                    "view": view,
                    "include_patterns_value": "\n".join(include_patterns),
                    "exclude_patterns_value": "\n".join(exclude_patterns),
                    "repo_import_days": import_days,
                },
                status_code=_status_code_for_error(exc, default=400),
            )

        return _redirect_with_flash(f"/repositories/{repo_id}", "Repository patterns saved.")

    @app.get("/sessions", response_class=HTMLResponse)
    async def sessions_page(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        try:
            summary = await svc.sessions()
        except GitPulseAPIError as exc:
            return _render(
                request,
                "sessions.html",
                {
                    **_page_meta(
                        active_nav="sessions",
                        eyebrow="Focus Sessions",
                        heading="Session rhythm",
                        description=(
                            "Sessions are built from activity windows separated by inactivity gaps."
                        ),
                        error=exc.message,
                        backend_status=_backend_status(request, exc),
                    ),
                    "summary": None,
                },
                status_code=_status_code_for_error(exc),
            )

        return _render(
            request,
            "sessions.html",
            {
                **_page_meta(
                    active_nav="sessions",
                    eyebrow="Focus Sessions",
                    heading="Session rhythm",
                    description=(
                        "Sessions are built from activity windows separated by inactivity gaps."
                    ),
                    flash=_flash_from_query(request),
                ),
                "summary": summary,
            },
        )

    @app.get("/achievements", response_class=HTMLResponse)
    async def achievements_page(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        try:
            data = await svc.achievements()
        except GitPulseAPIError as exc:
            return _render(
                request,
                "achievements.html",
                {
                    **_page_meta(
                        active_nav="achievements",
                        eyebrow="Achievements",
                        heading="Consistency, not gimmicks",
                        description=(
                            "Score is separate from raw stats and the badge set stays "
                            "intentionally grounded."
                        ),
                        error=exc.message,
                        backend_status=_backend_status(request, exc),
                    ),
                    "data": None,
                },
                status_code=_status_code_for_error(exc),
            )

        return _render(
            request,
            "achievements.html",
            {
                **_page_meta(
                    active_nav="achievements",
                    eyebrow="Achievements",
                    heading="Consistency, not gimmicks",
                    description=(
                        "Score is separate from raw stats and the badge set stays intentionally "
                        "grounded."
                    ),
                    flash=_flash_from_query(request),
                ),
                "data": data,
            },
        )

    @app.get("/settings", response_class=HTMLResponse)
    async def settings_page(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        data, error = await _load_settings(svc)
        return _render(
            request,
            "settings.html",
            {
                **_page_meta(
                    active_nav="settings",
                    eyebrow="Settings",
                    heading="Identity, goals, and boundaries",
                    description=(
                        "Configured author emails shape commit and push history totals. Live "
                        "working-tree activity always counts locally."
                    ),
                    flash=_flash_from_query(request),
                    error=error.message if error else None,
                    backend_status=_backend_status(request, error),
                ),
                "data": data,
                "form_values": _settings_form_values(data) if data else _default_settings_form(),
            },
            status_code=_status_code_for_error(error),
        )

    @app.post("/settings", response_class=HTMLResponse)
    async def settings_save(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        form_values = _settings_form_values_from_form(form)

        try:
            payload = SaveSettingsRequest.model_validate(form_values)
            await svc.save_settings(payload)
        except GitPulseAPIError as exc:
            data, _ = await _load_settings(svc)
            return _render(
                request,
                "settings.html",
                {
                    **_page_meta(
                        active_nav="settings",
                        eyebrow="Settings",
                        heading="Identity, goals, and boundaries",
                        description=(
                            "Configured author emails shape commit and push history totals. Live "
                            "working-tree activity always counts locally."
                        ),
                        error=exc.message,
                        backend_status=_backend_status(request, exc),
                    ),
                    "data": data,
                    "form_values": form_values,
                },
                status_code=_status_code_for_error(exc, default=400),
            )

        return _redirect_with_flash("/settings", "Settings saved to the active config file.")

    @app.post("/actions/import", response_class=HTMLResponse)
    async def action_import(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        days = _parse_positive_int(form.get("days"), fallback=30)
        return await _run_action_panel(
            request,
            svc,
            action=lambda: svc.run_import(days=days),
            return_to=str(form.get("return_to", "/")) or "/",
            import_days=days,
        )

    @app.post("/actions/rescan", response_class=HTMLResponse)
    async def action_rescan(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        days = _parse_positive_int(form.get("days"), fallback=30)
        return await _run_action_panel(
            request,
            svc,
            action=svc.run_rescan,
            return_to=str(form.get("return_to", "/")) or "/",
            import_days=days,
        )

    @app.post("/actions/rebuild", response_class=HTMLResponse)
    async def action_rebuild(
        request: Request,
        svc: Annotated[GitPulseService, Depends(_get_service)],
    ) -> Response:
        form = await request.form()
        days = _parse_positive_int(form.get("days"), fallback=30)
        return await _run_action_panel(
            request,
            svc,
            action=svc.run_rebuild,
            return_to=str(form.get("return_to", "/")) or "/",
            import_days=days,
        )

    return app


async def _mutate_repositories(
    request: Request,
    svc: GitPulseService,
    *,
    action: Any,
    success_message: str,
    redirect_to: str,
) -> Response:
    error: str | None = None
    error_exc: GitPulseAPIError | None = None
    try:
        await action()
    except GitPulseAPIError as exc:
        error = exc.message
        error_exc = exc

    cards, load_error = await _load_repositories(svc)
    if error is None and load_error is not None:
        error = load_error.message
        error_exc = load_error
    elif error_exc is None:
        error_exc = load_error

    if _is_htmx(request):
        return _render(
            request,
            "partials/repository_section.html",
            {
                "cards": cards,
                "message": None if error else success_message,
                "level": "success",
                "error": error,
                "backend_status": _backend_status(request, error_exc),
                "inline_backend_status": True,
            },
            status_code=200 if error is None else _status_code_for_error(error_exc, default=400),
        )

    if error:
        return _redirect_with_flash("/repositories", error, level="error")
    return _redirect_with_flash(redirect_to, success_message)


async def _load_repositories(
    svc: GitPulseService,
) -> tuple[list[RepositoryCard], GitPulseAPIError | None]:
    try:
        return await svc.repositories(), None
    except GitPulseAPIError as exc:
        return [], exc


async def _load_repo_detail(
    svc: GitPulseService,
    repo_id: str,
) -> tuple[RepoDetailView | None, GitPulseAPIError | None]:
    try:
        return await svc.repo_detail(repo_id), None
    except GitPulseAPIError as exc:
        return None, exc


async def _load_settings(
    svc: GitPulseService,
) -> tuple[SettingsResponse | None, GitPulseAPIError | None]:
    try:
        return await svc.settings(), None
    except GitPulseAPIError as exc:
        return None, exc


async def _load_import_days(svc: GitPulseService) -> int:
    data, _ = await _load_settings(svc)
    if data is None:
        return 30
    return max(data.config.monitoring.import_days, 1)


async def _action_panel_context(
    request: Request,
    svc: GitPulseService,
    *,
    return_to: str,
    tracked_total: int | None = None,
    result: ActionResult | None = None,
    error: GitPulseAPIError | None = None,
    import_days: int | None = None,
) -> dict[str, Any]:
    resolved_total = tracked_total
    panel_error = error
    if resolved_total is None:
        cards, repo_error = await _load_repositories(svc)
        resolved_total = len(cards)
        if panel_error is None:
            panel_error = repo_error

    resolved_days = import_days if import_days is not None else await _load_import_days(svc)

    return {
        "action_return_to": return_to,
        "action_tracked_total": resolved_total,
        "action_has_repositories": resolved_total > 0,
        "action_import_days": resolved_days,
        "action_result": result,
        "action_error": error.message if error else None,
        "action_backend_status": _backend_status(request, panel_error),
    }


async def _run_action_panel(
    request: Request,
    svc: GitPulseService,
    *,
    action: Any,
    return_to: str,
    import_days: int,
) -> Response:
    result: ActionResult | None = None
    error: GitPulseAPIError | None = None
    try:
        result = await action()
    except GitPulseAPIError as exc:
        error = exc

    action_panel = await _action_panel_context(
        request,
        svc,
        return_to=return_to,
        result=result,
        error=error,
        import_days=import_days,
    )

    if _is_htmx(request):
        return _render(
            request,
            "partials/action_center.html",
            action_panel,
            status_code=200 if error is None else _status_code_for_error(error, default=400),
        )

    if error is not None:
        return _redirect_with_flash(return_to, error.message, level="error")
    return _redirect_with_flash(return_to, result.summary if result else "Action completed.")


def _page_meta(
    *,
    active_nav: str,
    eyebrow: str,
    heading: str,
    description: str,
    flash: Mapping[str, str] | None = None,
    error: str | None = None,
    backend_status: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "active_nav": active_nav,
        "eyebrow": eyebrow,
        "heading": heading,
        "description": description,
        "flash": flash,
        "error": error,
        "backend_status": backend_status,
    }


def _render(
    request: Request,
    template_name: str,
    context: dict[str, Any],
    *,
    status_code: int = 200,
) -> Response:
    return templates.TemplateResponse(
        request=request,
        name=template_name,
        context=context,
        status_code=status_code,
    )


def _get_service(request: Request) -> GitPulseService:
    return cast(GitPulseService, request.app.state.service)


def _flash_from_query(request: Request) -> dict[str, str] | None:
    message = request.query_params.get("message")
    if not message:
        return None
    return {
        "message": message,
        "level": request.query_params.get("level", "success"),
    }


def _redirect_with_flash(path: str, message: str, *, level: str = "success") -> RedirectResponse:
    query = urlencode({"message": message, "level": level})
    return RedirectResponse(url=f"{path}?{query}", status_code=303)


def _split_lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def _parse_positive_int(value: Any, *, fallback: int) -> int:
    try:
        parsed = int(str(value or "").strip())
    except ValueError:
        return fallback
    return parsed if parsed > 0 else fallback


def _join_lines(value: list[str]) -> str:
    return "\n".join(value)


def _short_sha(value: str) -> str:
    return value[:7]


def _sum_lines(additions: int, deletions: int) -> int:
    return additions + deletions


def _is_htmx(request: Request) -> bool:
    return request.headers.get("HX-Request", "").lower() == "true"


def _format_datetime(value: Any) -> str:
    if value is None:
        return "-"
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d %H:%M")
    return str(value)


def _format_short(value: Any) -> str:
    if value is None:
        return "-"
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    return str(value)


def _heatmap_class(score: int) -> str:
    if score >= 80:
        return "heat-strong"
    if score >= 40:
        return "heat-medium"
    if score > 0:
        return "heat-light"
    return "heat-empty"


def _push_kind_label(value: str) -> str:
    labels = {
        "push_detected_local": "Detected locally",
        "push_remote_confirmed": "Remote confirmed",
    }
    return labels.get(value, value.replace("_", " ").title())


def _status_code_for_error(
    error: GitPulseAPIError | None,
    *,
    default: int = 200,
) -> int:
    if error is None:
        return default
    if error.status_code == 404:
        return 404
    if error.kind in {"backend_unreachable", "backend_timeout", "backend_transport"}:
        return 503
    if error.kind == "backend_response":
        return 502
    if error.status_code is not None:
        return error.status_code
    return default


def _backend_status(
    request: Request,
    error: GitPulseAPIError | None,
) -> dict[str, str] | None:
    if error is None:
        return None

    base_url = error.base_url or cast(UISettings, request.app.state.settings).api_base_url
    if error.kind == "backend_unreachable":
        title = "GitPulse backend unavailable"
    elif error.kind == "backend_timeout":
        title = "GitPulse backend timed out"
    elif error.kind in {"backend_transport", "backend_response"}:
        title = "GitPulse backend communication issue"
    else:
        return None

    return {
        "title": title,
        "message": error.message,
        "base_url": base_url,
        "command": "go run ./cmd/gitpulse serve",
        "env_var": "GITPULSE_UI_API_BASE_URL",
    }


jinja_globals = cast(dict[str, Any], templates.env.globals)
jinja_globals.update(
    split_lines=_join_lines,
    short_sha=_short_sha,
    sum_lines=_sum_lines,
    heatmap_class=_heatmap_class,
    push_kind_label=_push_kind_label,
)
templates.env.filters["fmt_datetime"] = _format_datetime
templates.env.filters["fmt_short"] = _format_short


def _settings_form_values(data: SettingsResponse) -> dict[str, Any]:
    return {
        "authors": "\n".join(author.email for author in data.config.authors),
        "changed_lines_per_day": data.config.goals.changed_lines_per_day,
        "commits_per_day": data.config.goals.commits_per_day,
        "focus_minutes_per_day": data.config.goals.focus_minutes_per_day,
        "timezone": data.config.ui.timezone,
        "day_boundary_minutes": data.config.ui.day_boundary_minutes,
        "session_gap_minutes": data.config.monitoring.session_gap_minutes,
        "import_days": data.config.monitoring.import_days,
        "include_patterns": "\n".join(data.config.patterns.include),
        "exclude_patterns": "\n".join(data.config.patterns.exclude),
        "github_enabled": data.config.github.enabled,
        "github_verify_remote_pushes": data.config.github.verify_remote_pushes,
        "github_token": "",
    }


def _settings_form_values_from_form(form: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "authors": _split_lines(str(form.get("authors", ""))),
        "changed_lines_per_day": int(str(form.get("changed_lines_per_day", "0")) or 0),
        "commits_per_day": int(str(form.get("commits_per_day", "0")) or 0),
        "focus_minutes_per_day": int(str(form.get("focus_minutes_per_day", "0")) or 0),
        "timezone": str(form.get("timezone", "UTC")),
        "day_boundary_minutes": int(str(form.get("day_boundary_minutes", "0")) or 0),
        "session_gap_minutes": int(str(form.get("session_gap_minutes", "15")) or 15),
        "import_days": int(str(form.get("import_days", "30")) or 30),
        "include_patterns": _split_lines(str(form.get("include_patterns", ""))),
        "exclude_patterns": _split_lines(str(form.get("exclude_patterns", ""))),
        "github_enabled": form.get("github_enabled") == "on",
        "github_verify_remote_pushes": form.get("github_verify_remote_pushes") == "on",
        "github_token": str(form.get("github_token", "")),
    }


def _default_settings_form() -> dict[str, Any]:
    return {
        "authors": "",
        "changed_lines_per_day": 0,
        "commits_per_day": 0,
        "focus_minutes_per_day": 0,
        "timezone": "UTC",
        "day_boundary_minutes": 0,
        "session_gap_minutes": 15,
        "import_days": 30,
        "include_patterns": "",
        "exclude_patterns": "",
        "github_enabled": False,
        "github_verify_remote_pushes": False,
        "github_token": "",
    }
