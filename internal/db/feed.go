package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// RecentActivityFeed returns the most recent activity across commits, pushes,
// and file activity events, joined with repository names.
func RecentActivityFeed(ctx context.Context, pool *pgxpool.Pool, limit int) ([]models.ActivityFeedItem, error) {
	rows, err := pool.Query(ctx, `
		SELECT kind, repo_name, observed_at, detail
		FROM (
			SELECT
				'commit'            AS kind,
				r.name              AS repo_name,
				c.authored_at_utc   AS observed_at,
				c.summary           AS detail
			FROM commit_events c
			JOIN repositories r ON r.id = c.repo_id
			WHERE r.state != 'removed'

			UNION ALL

			SELECT
				'push'              AS kind,
				r.name              AS repo_name,
				p.observed_at_utc   AS observed_at,
				COALESCE(p.notes, 'push detected') AS detail
			FROM push_events p
			JOIN repositories r ON r.id = p.repo_id
			WHERE r.state != 'removed'

			UNION ALL

			SELECT
				'file_change'       AS kind,
				r.name              AS repo_name,
				f.observed_at_utc   AS observed_at,
				f.relative_path     AS detail
			FROM file_activity_events f
			JOIN repositories r ON r.id = f.repo_id
			WHERE r.state != 'removed'
		) feed
		ORDER BY observed_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.ActivityFeedItem
	for rows.Next() {
		var item models.ActivityFeedItem
		var ts time.Time
		if err := rows.Scan(&item.Kind, &item.RepoName, &ts, &item.Detail); err != nil {
			return nil, fmt.Errorf("scan feed item: %w", err)
		}
		item.Timestamp = ts
		items = append(items, item)
	}
	return items, rows.Err()
}
