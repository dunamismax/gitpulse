package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertCommits batch-inserts commit events, ignoring duplicates keyed on
// (repo_id, commit_sha). Returns the number of rows actually inserted.
func InsertCommits(ctx context.Context, pool *pgxpool.Pool, commits []models.CommitEvent) (int, error) {
	if len(commits) == 0 {
		return 0, nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	inserted := 0
	for _, c := range commits {
		tag, err := tx.Exec(ctx, `
			INSERT INTO commit_events
				(id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
				 summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			ON CONFLICT (repo_id, commit_sha) DO NOTHING
		`,
			c.ID, c.RepoID, c.CommitSHA, c.AuthoredAt.UTC(), c.AuthorName, c.AuthorEmail,
			c.Summary, c.Branch, c.Additions, c.Deletions, c.FilesChanged, c.IsMerge, c.ImportedAt.UTC(),
		)
		if err != nil {
			return inserted, fmt.Errorf("insert commit %s: %w", c.CommitSHA, err)
		}
		inserted += int(tag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		return inserted, fmt.Errorf("commit tx: %w", err)
	}
	return inserted, nil
}

// ListCommits returns recent commits. If repoID is nil, returns global results.
func ListCommits(ctx context.Context, pool *pgxpool.Pool, repoID *uuid.UUID, limit int) ([]models.CommitEvent, error) {
	var rows pgx.Rows
	var err error

	if repoID != nil {
		rows, err = pool.Query(ctx, `
			SELECT id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
			       summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc
			FROM commit_events
			WHERE repo_id = $1
			ORDER BY authored_at_utc DESC
			LIMIT $2
		`, *repoID, limit)
	} else {
		rows, err = pool.Query(ctx, `
			SELECT id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
			       summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc
			FROM commit_events
			ORDER BY authored_at_utc DESC
			LIMIT $1
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCommits(rows)
}

// AllCommitsForAnalytics loads all commit events for a full analytics rebuild.
func AllCommitsForAnalytics(ctx context.Context, pool *pgxpool.Pool) ([]models.CommitEvent, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
		       summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc
		FROM commit_events
		ORDER BY repo_id, authored_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCommits(rows)
}

func scanCommits(rows pgx.Rows) ([]models.CommitEvent, error) {
	var commits []models.CommitEvent
	for rows.Next() {
		var c models.CommitEvent
		err := rows.Scan(
			&c.ID, &c.RepoID, &c.CommitSHA, &c.AuthoredAt, &c.AuthorName, &c.AuthorEmail,
			&c.Summary, &c.Branch, &c.Additions, &c.Deletions, &c.FilesChanged, &c.IsMerge, &c.ImportedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan commit: %w", err)
		}
		commits = append(commits, c)
	}
	return commits, rows.Err()
}
