package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertCommits batch-inserts commit events, ignoring duplicates keyed on
// (repo_id, commit_sha). Returns the number of rows actually inserted.
func InsertCommits(ctx context.Context, db *sql.DB, commits []models.CommitEvent) (int, error) {
	if len(commits) == 0 {
		return 0, nil
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	inserted := 0
	for _, c := range commits {
		result, err := tx.ExecContext(ctx, `
			INSERT INTO commit_events
				(id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
				 summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(repo_id, commit_sha) DO NOTHING
		`,
			c.ID.String(), c.RepoID.String(), c.CommitSHA, formatTime(c.AuthoredAt), nullableString(c.AuthorName), nullableString(c.AuthorEmail),
			c.Summary, nullableString(c.Branch), c.Additions, c.Deletions, c.FilesChanged, c.IsMerge, formatTime(c.ImportedAt),
		)
		if err != nil {
			return inserted, fmt.Errorf("insert commit %s: %w", c.CommitSHA, err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return inserted, fmt.Errorf("read rows affected for commit %s: %w", c.CommitSHA, err)
		}
		inserted += int(affected)
	}

	if err := tx.Commit(); err != nil {
		return inserted, fmt.Errorf("commit tx: %w", err)
	}
	return inserted, nil
}

// ListCommits returns recent commits. If repoID is nil, returns global results.
func ListCommits(ctx context.Context, db *sql.DB, repoID *uuid.UUID, limit int) ([]models.CommitEvent, error) {
	var (
		rows *sql.Rows
		err  error
	)

	if repoID != nil {
		rows, err = db.QueryContext(ctx, `
			SELECT id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
			       summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc
			FROM commit_events
			WHERE repo_id = ?
			ORDER BY authored_at_utc DESC
			LIMIT ?
		`, repoID.String(), limit)
	} else {
		rows, err = db.QueryContext(ctx, `
			SELECT id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
			       summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc
			FROM commit_events
			ORDER BY authored_at_utc DESC
			LIMIT ?
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	return scanCommits(rows)
}

// AllCommitsForAnalytics loads all commit events for a full analytics rebuild.
func AllCommitsForAnalytics(ctx context.Context, db *sql.DB) ([]models.CommitEvent, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_id, commit_sha, authored_at_utc, author_name, author_email,
		       summary, branch, additions, deletions, files_changed, is_merge, imported_at_utc
		FROM commit_events
		ORDER BY repo_id, authored_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	return scanCommits(rows)
}

func scanCommits(rows *sql.Rows) (_ []models.CommitEvent, err error) {
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close commit rows: %w", closeErr)
		}
	}()

	var commits []models.CommitEvent
	for rows.Next() {
		var c models.CommitEvent
		var idText string
		var repoIDText string
		var authoredAt string
		var authorName sql.NullString
		var authorEmail sql.NullString
		var branch sql.NullString
		var importedAt string

		if err := rows.Scan(
			&idText, &repoIDText, &c.CommitSHA, &authoredAt, &authorName, &authorEmail,
			&c.Summary, &branch, &c.Additions, &c.Deletions, &c.FilesChanged, &c.IsMerge, &importedAt,
		); err != nil {
			return nil, fmt.Errorf("scan commit: %w", err)
		}

		id, err := parseUUID(idText)
		if err != nil {
			return nil, err
		}
		repoID, err := parseUUID(repoIDText)
		if err != nil {
			return nil, err
		}
		c.ID = id
		c.RepoID = repoID
		c.AuthorName = optionalString(authorName)
		c.AuthorEmail = optionalString(authorEmail)
		c.Branch = optionalString(branch)

		c.AuthoredAt, err = parseTime(authoredAt)
		if err != nil {
			return nil, fmt.Errorf("scan commit authored_at: %w", err)
		}
		c.ImportedAt, err = parseTime(importedAt)
		if err != nil {
			return nil, fmt.Errorf("scan commit imported_at: %w", err)
		}

		commits = append(commits, c)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return commits, nil
}
