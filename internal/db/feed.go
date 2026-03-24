package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dunamismax/gitpulse/internal/models"
)

// RecentActivityFeed returns the most recent activity across commits, pushes,
// and file activity events, joined with repository names.
func RecentActivityFeed(ctx context.Context, db *sql.DB, limit int) (_ []models.ActivityFeedItem, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT kind, repo_name, observed_at, detail
		FROM (
			SELECT
				'commit' AS kind,
				r.name AS repo_name,
				c.authored_at_utc AS observed_at,
				c.summary AS detail
			FROM commit_events c
			JOIN repositories r ON r.id = c.repo_id
			WHERE r.state != 'removed'

			UNION ALL

			SELECT
				'push' AS kind,
				r.name AS repo_name,
				p.observed_at_utc AS observed_at,
				COALESCE(p.notes, 'push detected') AS detail
			FROM push_events p
			JOIN repositories r ON r.id = p.repo_id
			WHERE r.state != 'removed'

			UNION ALL

			SELECT
				'file_change' AS kind,
				r.name AS repo_name,
				f.observed_at_utc AS observed_at,
				f.relative_path AS detail
			FROM file_activity_events f
			JOIN repositories r ON r.id = f.repo_id
			WHERE r.state != 'removed'
		) feed
		ORDER BY observed_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close feed rows: %w", closeErr)
		}
	}()

	var items []models.ActivityFeedItem
	for rows.Next() {
		var item models.ActivityFeedItem
		var timestamp string
		if err := rows.Scan(&item.Kind, &item.RepoName, &timestamp, &item.Detail); err != nil {
			return nil, fmt.Errorf("scan feed item: %w", err)
		}
		parsed, err := parseTime(timestamp)
		if err != nil {
			return nil, fmt.Errorf("scan feed timestamp: %w", err)
		}
		item.Timestamp = parsed
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}
