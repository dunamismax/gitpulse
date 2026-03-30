package models

import "github.com/dunamismax/gitpulse/internal/config"

// ErrorResponse is the standard JSON error payload.
type ErrorResponse struct {
	Error string `json:"error"`
}

// DashboardResponse is the frontend-facing response for the dashboard endpoint.
type DashboardResponse struct {
	Data DashboardView `json:"data"`
}

// RepositoriesPayload is the frontend-facing repository collection payload.
type RepositoriesPayload struct {
	Repositories []RepoCard `json:"repositories"`
}

// RepositoriesResponse is the frontend-facing response for the repositories endpoint.
type RepositoriesResponse struct {
	Data RepositoriesPayload `json:"data"`
}

// RepoDetailResponse is the frontend-facing response for the repository detail endpoint.
type RepoDetailResponse struct {
	Data RepoDetailView `json:"data"`
}

// AchievementsView is the frontend-facing achievements payload.
type AchievementsView struct {
	Achievements []Achievement `json:"achievements"`
	Streaks      StreakSummary `json:"streaks"`
	TodayScore   int           `json:"today_score"`
}

// AchievementsResponse is the frontend-facing response for the achievements endpoint.
type AchievementsResponse struct {
	Data AchievementsView `json:"data"`
}

// SessionsResponse is the frontend-facing response for the sessions endpoint.
type SessionsResponse struct {
	Data SessionSummary `json:"data"`
}

// SettingsView is the frontend-facing settings payload.
type SettingsView struct {
	Config config.AppConfig `json:"config"`
	Paths  config.AppPaths  `json:"paths"`
}

// SettingsResponse is the frontend-facing response for the settings endpoint.
type SettingsResponse struct {
	Data SettingsView `json:"data"`
}

// ActionPayload is the frontend-facing payload shared by action endpoints.
type ActionPayload struct {
	Result         OperatorActionResult `json:"result"`
	Repositories   []Repository         `json:"repositories,omitempty"`
	Repository     *Repository          `json:"repository,omitempty"`
	RepositoryCard *RepoCard            `json:"repository_card,omitempty"`
	Settings       *SettingsView        `json:"settings,omitempty"`
}

// ActionResponse is the frontend-facing response shared by action endpoints.
type ActionResponse struct {
	Data ActionPayload `json:"data"`
}
