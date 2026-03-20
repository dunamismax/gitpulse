use std::path::PathBuf;

use anyhow::Result;
use askama::Template;
use axum::{
    Form, Router,
    extract::{Path, State},
    response::{Html, IntoResponse, Redirect},
    routing::{get, post},
};
use gitpulse_core::{
    RepoCard, RepoDetailView, RepoHealth, RepoPatternSettings, SessionSummary, TodaySummary,
};
use gitpulse_runtime::{
    AchievementsView, ActivityFeedItem, DashboardView, GitPulseRuntime, SettingsView,
};
use tower_http::{compression::CompressionLayer, services::ServeDir, trace::TraceLayer};

#[derive(Clone)]
pub struct WebState {
    pub runtime: GitPulseRuntime,
}

pub fn router(runtime: GitPulseRuntime) -> Router {
    let assets_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets");
    Router::new()
        .route("/", get(dashboard_page))
        .route("/repositories", get(repositories_page))
        .route("/repositories/add", post(add_repository))
        .route("/repositories/{id}/refresh", post(refresh_repository))
        .route("/repositories/{id}/patterns", post(update_repository_patterns))
        .route("/repositories/{id}/toggle", post(toggle_repository))
        .route("/repositories/{id}/remove", post(remove_repository))
        .route("/repositories/{id}", get(repository_detail_page))
        .route("/sessions", get(sessions_page))
        .route("/achievements", get(achievements_page))
        .route("/settings", get(settings_page).post(update_settings))
        .route("/partials/dashboard-summary", get(dashboard_summary_partial))
        .route("/partials/activity-feed", get(activity_feed_partial))
        .route("/partials/repo-cards", get(repo_cards_partial))
        .nest_service("/assets", ServeDir::new(assets_root))
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(WebState { runtime })
}

pub async fn run(runtime: GitPulseRuntime, listener: tokio::net::TcpListener) -> Result<()> {
    axum::serve(listener, router(runtime)).await?;
    Ok(())
}

async fn dashboard_page(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let view = state.runtime.dashboard_view().await?;
    render(DashboardPageTemplate {
        title: "Dashboard",
        today: view.today.clone(),
        items: view.activity_feed.clone(),
        cards: view.repo_cards.clone(),
        trend_chart_svg: render_trend_chart(&view.trend),
        heatmap_svg: render_heatmap(&view.heatmap),
        view,
        active_nav: "dashboard",
    })
}

async fn repositories_page(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let cards = state.runtime.repository_cards().await?;
    render(RepositoriesPageTemplate { title: "Repositories", cards, active_nav: "repositories" })
}

#[derive(serde::Deserialize)]
struct AddTargetForm {
    path: String,
}

async fn add_repository(
    State(state): State<WebState>,
    Form(form): Form<AddTargetForm>,
) -> Result<Redirect, WebError> {
    state.runtime.add_target(&form.path).await?;
    Ok(Redirect::to("/repositories"))
}

async fn refresh_repository(
    State(state): State<WebState>,
    Path(repo_id): Path<String>,
) -> Result<Redirect, WebError> {
    state.runtime.rescan_repository(&repo_id).await?;
    Ok(Redirect::to(format!("/repositories/{repo_id}").as_str()))
}

async fn toggle_repository(
    State(state): State<WebState>,
    Path(repo_id): Path<String>,
) -> Result<Redirect, WebError> {
    state.runtime.toggle_repository(&repo_id).await?;
    Ok(Redirect::to("/repositories"))
}

async fn remove_repository(
    State(state): State<WebState>,
    Path(repo_id): Path<String>,
) -> Result<Redirect, WebError> {
    state.runtime.remove_repository(&repo_id).await?;
    Ok(Redirect::to("/repositories"))
}

async fn repository_detail_page(
    State(state): State<WebState>,
    Path(repo_id): Path<String>,
) -> Result<Html<String>, WebError> {
    let detail = state.runtime.repo_detail(&repo_id).await?;
    let status = detail_status(&detail);
    render(RepoDetailPageTemplate {
        title: "Repository",
        language_chart_svg: render_rank_bars("Languages", &status.language_chart),
        files_chart_svg: render_rank_bars("Files", &status.file_chart),
        detail,
        status,
        active_nav: "repositories",
    })
}

#[derive(serde::Deserialize)]
struct RepoPatternForm {
    include_patterns: String,
    exclude_patterns: String,
}

async fn update_repository_patterns(
    State(state): State<WebState>,
    Path(repo_id): Path<String>,
    Form(form): Form<RepoPatternForm>,
) -> Result<Redirect, WebError> {
    state
        .runtime
        .update_repository_patterns(
            &repo_id,
            RepoPatternSettings {
                include: parse_patterns(&form.include_patterns),
                exclude: parse_patterns(&form.exclude_patterns),
            },
        )
        .await?;
    Ok(Redirect::to(format!("/repositories/{repo_id}").as_str()))
}

async fn sessions_page(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let summary = state.runtime.sessions_summary().await?;
    render(SessionsPageTemplate { title: "Sessions", summary, active_nav: "sessions" })
}

async fn achievements_page(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let view = state.runtime.achievements_view().await?;
    render(AchievementsPageTemplate { title: "Achievements", view, active_nav: "achievements" })
}

async fn settings_page(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let view = state.runtime.settings_view().await?;
    render(SettingsPageTemplate { title: "Settings", view, active_nav: "settings" })
}

#[derive(serde::Deserialize)]
struct SettingsForm {
    authors: String,
    changed_lines_per_day: i64,
    commits_per_day: i64,
    focus_minutes_per_day: i64,
    timezone: String,
    day_boundary_minutes: i32,
    session_gap_minutes: i64,
    import_days: i64,
    include_patterns: String,
    exclude_patterns: String,
    github_enabled: Option<String>,
    github_verify_remote_pushes: Option<String>,
    github_token: String,
}

async fn update_settings(
    State(state): State<WebState>,
    Form(form): Form<SettingsForm>,
) -> Result<Redirect, WebError> {
    let mut settings = state.runtime.settings_view().await?.settings;
    settings.authors = form
        .authors
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| gitpulse_core::AuthorIdentity {
            email: line.to_string(),
            name: None,
            aliases: Vec::new(),
        })
        .collect();
    settings.goals.changed_lines_per_day = form.changed_lines_per_day;
    settings.goals.commits_per_day = form.commits_per_day;
    settings.goals.focus_minutes_per_day = form.focus_minutes_per_day;
    settings.ui.timezone = form.timezone;
    settings.ui.day_boundary_minutes = form.day_boundary_minutes;
    settings.monitoring.session_gap_minutes = form.session_gap_minutes;
    settings.monitoring.import_days = form.import_days;
    settings.patterns.include = parse_patterns(&form.include_patterns);
    settings.patterns.exclude = parse_patterns(&form.exclude_patterns);
    settings.github.enabled = form.github_enabled.is_some();
    settings.github.verify_remote_pushes = form.github_verify_remote_pushes.is_some();
    settings.github.token =
        if form.github_token.trim().is_empty() { None } else { Some(form.github_token) };
    state.runtime.update_settings(settings).await?;
    Ok(Redirect::to("/settings"))
}

async fn dashboard_summary_partial(
    State(state): State<WebState>,
) -> Result<Html<String>, WebError> {
    let view = state.runtime.dashboard_view().await?;
    render(DashboardSummaryTemplate { today: view.today })
}

async fn activity_feed_partial(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let view = state.runtime.dashboard_view().await?;
    render(ActivityFeedTemplate { items: view.activity_feed })
}

async fn repo_cards_partial(State(state): State<WebState>) -> Result<Html<String>, WebError> {
    let cards = state.runtime.repository_cards().await?;
    render(RepoCardsTemplate { cards })
}

fn parse_patterns(value: &str) -> Vec<String> {
    value.lines().map(str::trim).filter(|line| !line.is_empty()).map(str::to_string).collect()
}

fn detail_status(detail: &RepoDetailView) -> RepoDetailStatus {
    let snapshot = detail.card.snapshot.clone();
    RepoDetailStatus {
        branch_label: snapshot
            .as_ref()
            .and_then(|entry| entry.branch.clone())
            .unwrap_or_else(|| "detached".into()),
        upstream_label: snapshot
            .as_ref()
            .and_then(|entry| entry.upstream_ref.clone())
            .unwrap_or_else(|| "No upstream".into()),
        live_lines: snapshot
            .as_ref()
            .map(|entry| entry.live_stats.total_changed_lines())
            .unwrap_or(0),
        staged_lines: snapshot
            .as_ref()
            .map(|entry| entry.staged_stats.total_changed_lines())
            .unwrap_or(0),
        last_push: detail
            .recent_pushes
            .first()
            .map(|push| push.observed_at_utc.format("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_else(|| "No push detected yet".into()),
        language_chart: detail.language_breakdown.clone(),
        file_chart: detail.files_touched.clone(),
    }
}

fn render<T: Template>(template: T) -> Result<Html<String>, WebError> {
    Ok(Html(template.render()?))
}

#[derive(Debug)]
struct WebError(anyhow::Error);

impl<E> From<E> for WebError
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self(value.into())
    }
}

impl IntoResponse for WebError {
    fn into_response(self) -> axum::response::Response {
        let body = format!("GitPulse hit an error: {}", self.0);
        (axum::http::StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
    }
}

#[derive(Template)]
#[template(path = "pages/dashboard.html")]
struct DashboardPageTemplate {
    title: &'static str,
    view: DashboardView,
    today: TodaySummary,
    items: Vec<ActivityFeedItem>,
    cards: Vec<RepoCard>,
    trend_chart_svg: String,
    heatmap_svg: String,
    active_nav: &'static str,
}

#[derive(Template)]
#[template(path = "pages/repositories.html")]
struct RepositoriesPageTemplate {
    title: &'static str,
    cards: Vec<gitpulse_core::RepoCard>,
    active_nav: &'static str,
}

#[derive(Clone)]
struct RepoDetailStatus {
    branch_label: String,
    upstream_label: String,
    live_lines: i64,
    staged_lines: i64,
    last_push: String,
    language_chart: Vec<(String, i64)>,
    file_chart: Vec<(String, i64)>,
}

#[derive(Template)]
#[template(path = "pages/repo_detail.html")]
struct RepoDetailPageTemplate {
    title: &'static str,
    detail: RepoDetailView,
    status: RepoDetailStatus,
    language_chart_svg: String,
    files_chart_svg: String,
    active_nav: &'static str,
}

#[derive(Template)]
#[template(path = "pages/sessions.html")]
struct SessionsPageTemplate {
    title: &'static str,
    summary: SessionSummary,
    active_nav: &'static str,
}

#[derive(Template)]
#[template(path = "pages/achievements.html")]
struct AchievementsPageTemplate {
    title: &'static str,
    view: AchievementsView,
    active_nav: &'static str,
}

#[derive(Template)]
#[template(path = "pages/settings.html")]
struct SettingsPageTemplate {
    title: &'static str,
    view: SettingsView,
    active_nav: &'static str,
}

#[derive(Template)]
#[template(path = "partials/dashboard_summary.html")]
struct DashboardSummaryTemplate {
    today: gitpulse_core::TodaySummary,
}

#[derive(Template)]
#[template(path = "partials/activity_feed.html")]
struct ActivityFeedTemplate {
    items: Vec<gitpulse_runtime::ActivityFeedItem>,
}

#[derive(Template)]
#[template(path = "partials/repo_cards.html")]
struct RepoCardsTemplate {
    cards: Vec<gitpulse_core::RepoCard>,
}

fn render_trend_chart(points: &[gitpulse_core::TrendPoint]) -> String {
    if points.is_empty() {
        return "<div class=\"empty-chart\">No activity yet.</div>".into();
    }
    let width = 720.0_f32;
    let height = 220.0_f32;
    let bar_width = width / points.len().max(1) as f32;
    let max_value =
        points.iter().map(|point| point.changed_lines.max(point.score)).max().unwrap_or(1) as f32;
    let bars = points
        .iter()
        .enumerate()
        .map(|(index, point)| {
            let x = index as f32 * bar_width;
            let bar_height = ((point.changed_lines as f32 / max_value) * (height - 40.0)).max(6.0);
            let y = height - bar_height - 20.0;
            format!(
                "<rect x=\"{x:.1}\" y=\"{y:.1}\" width=\"{w:.1}\" height=\"{h:.1}\" rx=\"6\" fill=\"url(#trendGradient)\" />",
                w = bar_width - 8.0,
                h = bar_height
            )
        })
        .collect::<String>();
    format!(
        "<svg viewBox=\"0 0 720 220\" class=\"chart-svg\" role=\"img\" aria-label=\"30 day trend\">
            <defs>
                <linearGradient id=\"trendGradient\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">
                    <stop offset=\"0%\" stop-color=\"#67e8f9\" />
                    <stop offset=\"100%\" stop-color=\"#0f766e\" />
                </linearGradient>
            </defs>
            <rect x=\"0\" y=\"0\" width=\"720\" height=\"220\" rx=\"18\" fill=\"#10151f\" />
            {bars}
        </svg>"
    )
}

fn render_heatmap(points: &[gitpulse_core::TrendPoint]) -> String {
    if points.is_empty() {
        return "<div class=\"empty-chart\">No activity yet.</div>".into();
    }
    let cell = 18_i64;
    let squares = points
        .iter()
        .rev()
        .enumerate()
        .map(|(index, point)| {
            let week = index / 7;
            let day = index % 7;
            let x = 20 + (week as i64 * (cell + 4));
            let y = 20 + (day as i64 * (cell + 4));
            let intensity = match point.score {
                0 => "#1f2937",
                1..=49 => "#134e4a",
                50..=149 => "#0f766e",
                150..=299 => "#14b8a6",
                _ => "#67e8f9",
            };
            format!("<rect x=\"{x}\" y=\"{y}\" width=\"{cell}\" height=\"{cell}\" rx=\"5\" fill=\"{intensity}\" />")
        })
        .collect::<String>();
    format!(
        "<svg viewBox=\"0 0 400 190\" class=\"chart-svg\" role=\"img\" aria-label=\"12 week heatmap\">
            <rect x=\"0\" y=\"0\" width=\"400\" height=\"190\" rx=\"18\" fill=\"#10151f\" />
            {squares}
        </svg>"
    )
}

fn render_rank_bars(label: &str, values: &[(String, i64)]) -> String {
    if values.is_empty() {
        return format!("<div class=\"empty-chart\">No {label} data yet.</div>");
    }
    let max = values.iter().map(|(_, value)| *value).max().unwrap_or(1).max(1) as f32;
    let bars = values
        .iter()
        .take(8)
        .enumerate()
        .map(|(index, (name, value))| {
            let y = 30 + (index as i64 * 28);
            let width = ((*value as f32 / max) * 220.0).max(12.0);
            format!(
                "<text x=\"16\" y=\"{text_y}\" fill=\"#cbd5e1\" font-size=\"12\">{name}</text>
                 <rect x=\"150\" y=\"{bar_y}\" width=\"{width:.1}\" height=\"14\" rx=\"7\" fill=\"#1d4ed8\" />",
                text_y = y,
                bar_y = y - 12
            )
        })
        .collect::<String>();
    format!(
        "<svg viewBox=\"0 0 420 280\" class=\"chart-svg\" role=\"img\" aria-label=\"{label}\">
            <rect x=\"0\" y=\"0\" width=\"420\" height=\"280\" rx=\"18\" fill=\"#10151f\" />
            {bars}
        </svg>"
    )
}
