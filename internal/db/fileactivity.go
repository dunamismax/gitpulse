package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertFileActivity batch-inserts file activity events in a transaction.
func InsertFileActivity(ctx context.Context, db *sql.DB, events []models.FileActivityEvent) error {
	if len(events) == 0 {
		return nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	for _, e := range events {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO file_activity_events
				(id, repo_id, observed_at_utc, relative_path, additions, deletions, kind)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`,
			e.ID.String(), e.RepoID.String(), formatTime(e.ObservedAt), e.RelativePath,
			e.Additions, e.Deletions, string(e.Kind),
		); err != nil {
			return fmt.Errorf("insert file activity: %w", err)
		}
	}

	return tx.Commit()
}

// TopFilesTouched returns the most frequently touched file paths. If repoID is
// nil, the query is global.
func TopFilesTouched(ctx context.Context, db *sql.DB, repoID *uuid.UUID, limit int) (_ []string, err error) {
	var (
		rows     *sql.Rows
		queryErr error
	)

	if repoID != nil {
		rows, queryErr = db.QueryContext(ctx, `
			SELECT relative_path
			FROM file_activity_events
			WHERE repo_id = ?
			GROUP BY relative_path
			ORDER BY COUNT(*) DESC
			LIMIT ?
		`, repoID.String(), limit)
	} else {
		rows, queryErr = db.QueryContext(ctx, `
			SELECT relative_path
			FROM file_activity_events
			GROUP BY relative_path
			ORDER BY COUNT(*) DESC
			LIMIT ?
		`, limit)
	}
	if queryErr != nil {
		return nil, queryErr
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close top files rows: %w", closeErr)
		}
	}()

	var paths []string
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, fmt.Errorf("scan path: %w", err)
		}
		paths = append(paths, path)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return paths, nil
}

// AllFileActivityForAnalytics loads all file activity events for a full rebuild.
func AllFileActivityForAnalytics(ctx context.Context, db *sql.DB) (_ []models.FileActivityEvent, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_id, observed_at_utc, relative_path, additions, deletions, kind
		FROM file_activity_events
		ORDER BY repo_id, observed_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close file activity rows: %w", closeErr)
		}
	}()

	var events []models.FileActivityEvent
	for rows.Next() {
		var e models.FileActivityEvent
		var idText string
		var repoIDText string
		var observedAt string
		var kind string

		if err := rows.Scan(
			&idText, &repoIDText, &observedAt, &e.RelativePath,
			&e.Additions, &e.Deletions, &kind,
		); err != nil {
			return nil, fmt.Errorf("scan file activity: %w", err)
		}

		id, err := parseUUID(idText)
		if err != nil {
			return nil, err
		}
		repoID, err := parseUUID(repoIDText)
		if err != nil {
			return nil, err
		}
		e.ID = id
		e.RepoID = repoID
		e.Kind = models.ActivityKind(kind)
		e.ObservedAt, err = parseTime(observedAt)
		if err != nil {
			return nil, fmt.Errorf("scan file activity observed_at: %w", err)
		}

		events = append(events, e)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}
