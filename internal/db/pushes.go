package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertPushEvent stores a single push event.
func InsertPushEvent(ctx context.Context, db *sql.DB, p models.PushEvent) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO push_events
			(id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		p.ID.String(), p.RepoID.String(), formatTime(p.ObservedAt), string(p.Kind),
		nullableString(p.HeadSHA), p.PushedCommitCount, nullableString(p.UpstreamRef), nullableString(p.Notes),
	)
	return err
}

// ListPushEvents returns recent push events. If repoID is nil, returns global results.
func ListPushEvents(ctx context.Context, db *sql.DB, repoID *uuid.UUID, limit int) ([]models.PushEvent, error) {
	var (
		rows *sql.Rows
		err  error
	)

	if repoID != nil {
		rows, err = db.QueryContext(ctx, `
			SELECT id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
			FROM push_events
			WHERE repo_id = ?
			ORDER BY observed_at_utc DESC
			LIMIT ?
		`, repoID.String(), limit)
	} else {
		rows, err = db.QueryContext(ctx, `
			SELECT id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
			FROM push_events
			ORDER BY observed_at_utc DESC
			LIMIT ?
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	return scanPushes(rows)
}

// AllPushEventsForAnalytics loads all push events for a full analytics rebuild.
func AllPushEventsForAnalytics(ctx context.Context, db *sql.DB) ([]models.PushEvent, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_id, observed_at_utc, kind, head_sha, pushed_commit_count, upstream_ref, notes
		FROM push_events
		ORDER BY repo_id, observed_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	return scanPushes(rows)
}

func scanPushes(rows *sql.Rows) (_ []models.PushEvent, err error) {
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close push rows: %w", closeErr)
		}
	}()

	var pushes []models.PushEvent
	for rows.Next() {
		var p models.PushEvent
		var idText string
		var repoIDText string
		var observedAt string
		var kind string
		var headSHA sql.NullString
		var upstreamRef sql.NullString
		var notes sql.NullString

		if err := rows.Scan(
			&idText, &repoIDText, &observedAt, &kind,
			&headSHA, &p.PushedCommitCount, &upstreamRef, &notes,
		); err != nil {
			return nil, fmt.Errorf("scan push: %w", err)
		}

		id, err := parseUUID(idText)
		if err != nil {
			return nil, err
		}
		repoID, err := parseUUID(repoIDText)
		if err != nil {
			return nil, err
		}
		p.ID = id
		p.RepoID = repoID
		p.Kind = models.PushKind(kind)
		p.HeadSHA = optionalString(headSHA)
		p.UpstreamRef = optionalString(upstreamRef)
		p.Notes = optionalString(notes)
		p.ObservedAt, err = parseTime(observedAt)
		if err != nil {
			return nil, fmt.Errorf("scan push observed_at: %w", err)
		}

		pushes = append(pushes, p)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return pushes, nil
}
