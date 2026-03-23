package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertPushEvent stores a single push event.
func InsertPushEvent(ctx context.Context, pool *pgxpool.Pool, p models.PushEvent) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO push_events
			(id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
	`,
		p.ID, p.RepoID, p.ObservedAt.UTC(), string(p.Kind),
		p.HeadSHA, p.PushedCommitCount, p.UpstreamRef, p.Notes,
	)
	return err
}

// ListPushEvents returns recent push events. If repoID is nil, returns global results.
func ListPushEvents(ctx context.Context, pool *pgxpool.Pool, repoID *uuid.UUID, limit int) ([]models.PushEvent, error) {
	var rows pgx.Rows
	var err error

	if repoID != nil {
		rows, err = pool.Query(ctx, `
			SELECT id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
			FROM push_events
			WHERE repo_id = $1
			ORDER BY observed_at_utc DESC
			LIMIT $2
		`, *repoID, limit)
	} else {
		rows, err = pool.Query(ctx, `
			SELECT id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
			FROM push_events
			ORDER BY observed_at_utc DESC
			LIMIT $1
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPushes(rows)
}

// AllPushEventsForAnalytics loads all push events for a full analytics rebuild.
func AllPushEventsForAnalytics(ctx context.Context, pool *pgxpool.Pool) ([]models.PushEvent, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
		FROM push_events
		ORDER BY repo_id, observed_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanPushes(rows)
}

func scanPushes(rows pgx.Rows) ([]models.PushEvent, error) {
	var pushes []models.PushEvent
	for rows.Next() {
		var p models.PushEvent
		var kind string
		err := rows.Scan(
			&p.ID, &p.RepoID, &p.ObservedAt, &kind,
			&p.HeadSHA, &p.PushedCommitCount, &p.UpstreamRef, &p.Notes,
		)
		if err != nil {
			return nil, fmt.Errorf("scan push: %w", err)
		}
		p.Kind = models.PushKind(kind)
		pushes = append(pushes, p)
	}
	return pushes, rows.Err()
}
