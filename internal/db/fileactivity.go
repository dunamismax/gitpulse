package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertFileActivity batch-inserts file activity events in a transaction.
func InsertFileActivity(ctx context.Context, pool *pgxpool.Pool, events []models.FileActivityEvent) error {
	if len(events) == 0 {
		return nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, e := range events {
		_, err := tx.Exec(ctx, `
			INSERT INTO file_activity_events
				(id, repo_id, observed_at_utc, relative_path, additions, deletions, kind)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
		`,
			e.ID, e.RepoID, e.ObservedAt.UTC(), e.RelativePath,
			e.Additions, e.Deletions, string(e.Kind),
		)
		if err != nil {
			return fmt.Errorf("insert file activity: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// TopFilesTouched returns the most frequently touched file paths. If repoID is
// nil, the query is global.
func TopFilesTouched(ctx context.Context, pool *pgxpool.Pool, repoID *uuid.UUID, limit int) ([]string, error) {
	var rows interface {
		Next() bool
		Scan(...any) error
		Err() error
		Close()
	}
	var err error

	if repoID != nil {
		r, e := pool.Query(ctx, `
			SELECT relative_path
			FROM file_activity_events
			WHERE repo_id = $1
			GROUP BY relative_path
			ORDER BY COUNT(*) DESC
			LIMIT $2
		`, *repoID, limit)
		rows, err = r, e
	} else {
		r, e := pool.Query(ctx, `
			SELECT relative_path
			FROM file_activity_events
			GROUP BY relative_path
			ORDER BY COUNT(*) DESC
			LIMIT $1
		`, limit)
		rows, err = r, e
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, fmt.Errorf("scan path: %w", err)
		}
		paths = append(paths, p)
	}
	return paths, rows.Err()
}

// AllFileActivityForAnalytics loads all file activity events for a full rebuild.
func AllFileActivityForAnalytics(ctx context.Context, pool *pgxpool.Pool) ([]models.FileActivityEvent, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, repo_id, observed_at_utc, relative_path, additions, deletions, kind
		FROM file_activity_events
		ORDER BY repo_id, observed_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.FileActivityEvent
	for rows.Next() {
		var e models.FileActivityEvent
		var kind string
		if err := rows.Scan(
			&e.ID, &e.RepoID, &e.ObservedAt, &e.RelativePath,
			&e.Additions, &e.Deletions, &kind,
		); err != nil {
			return nil, fmt.Errorf("scan file activity: %w", err)
		}
		e.Kind = models.ActivityKind(kind)
		events = append(events, e)
	}
	return events, rows.Err()
}
