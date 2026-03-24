package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertSnapshot stores a repository status snapshot.
func InsertSnapshot(ctx context.Context, db *sql.DB, s models.RepoStatusSnapshot) error {
	langJSON, err := encodeJSON(s.LanguageBreakdown)
	if err != nil {
		return fmt.Errorf("marshal language breakdown: %w", err)
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO repo_status_snapshots
			(id, repo_id, observed_at_utc, branch, is_detached, head_sha,
			 upstream_ref, upstream_head_sha, ahead_count, behind_count,
			 live_additions, live_deletions, live_files,
			 staged_additions, staged_deletions, staged_files,
			 files_touched, repo_size_bytes, language_breakdown)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		s.ID.String(), s.RepoID.String(), formatTime(s.ObservedAt), nullableString(s.Branch), s.IsDetached, nullableString(s.HeadSHA),
		nullableString(s.UpstreamRef), nullableString(s.UpstreamHeadSHA), s.AheadCount, s.BehindCount,
		s.LiveAdditions, s.LiveDeletions, s.LiveFiles,
		s.StagedAdditions, s.StagedDeletions, s.StagedFiles,
		s.FilesTouched, s.RepoSizeBytes, langJSON,
	)
	return err
}

// LatestSnapshot returns the most recent snapshot for a repository.
func LatestSnapshot(ctx context.Context, db *sql.DB, repoID uuid.UUID) (*models.RepoStatusSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_id, observed_at_utc, branch, is_detached, head_sha,
		       upstream_ref, upstream_head_sha, ahead_count, behind_count,
		       live_additions, live_deletions, live_files,
		       staged_additions, staged_deletions, staged_files,
		       files_touched, repo_size_bytes, language_breakdown
		FROM repo_status_snapshots
		WHERE repo_id = ?
		ORDER BY observed_at_utc DESC
		LIMIT 1
	`, repoID.String())
	if err != nil {
		return nil, err
	}
	snaps, err := scanSnapshots(rows)
	if err != nil {
		return nil, err
	}
	if len(snaps) == 0 {
		return nil, nil
	}
	return &snaps[0], nil
}

// RecentSnapshots returns the last N snapshots for a repository.
func RecentSnapshots(ctx context.Context, db *sql.DB, repoID uuid.UUID, limit int) ([]models.RepoStatusSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_id, observed_at_utc, branch, is_detached, head_sha,
		       upstream_ref, upstream_head_sha, ahead_count, behind_count,
		       live_additions, live_deletions, live_files,
		       staged_additions, staged_deletions, staged_files,
		       files_touched, repo_size_bytes, language_breakdown
		FROM repo_status_snapshots
		WHERE repo_id = ?
		ORDER BY observed_at_utc DESC
		LIMIT ?
	`, repoID.String(), limit)
	if err != nil {
		return nil, err
	}
	return scanSnapshots(rows)
}

// AllSnapshotsForAnalytics loads the full snapshots table for analytics rebuild.
func AllSnapshotsForAnalytics(ctx context.Context, db *sql.DB) ([]models.RepoStatusSnapshot, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_id, observed_at_utc, branch, is_detached, head_sha,
		       upstream_ref, upstream_head_sha, ahead_count, behind_count,
		       live_additions, live_deletions, live_files,
		       staged_additions, staged_deletions, staged_files,
		       files_touched, repo_size_bytes, language_breakdown
		FROM repo_status_snapshots
		ORDER BY repo_id, observed_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	return scanSnapshots(rows)
}

func scanSnapshots(rows *sql.Rows) (_ []models.RepoStatusSnapshot, err error) {
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close snapshot rows: %w", closeErr)
		}
	}()

	var snaps []models.RepoStatusSnapshot
	for rows.Next() {
		var s models.RepoStatusSnapshot
		var idText string
		var repoIDText string
		var observedAt string
		var branch sql.NullString
		var headSHA sql.NullString
		var upstreamRef sql.NullString
		var upstreamHeadSHA sql.NullString
		var langJSON string

		if err := rows.Scan(
			&idText, &repoIDText, &observedAt, &branch, &s.IsDetached, &headSHA,
			&upstreamRef, &upstreamHeadSHA, &s.AheadCount, &s.BehindCount,
			&s.LiveAdditions, &s.LiveDeletions, &s.LiveFiles,
			&s.StagedAdditions, &s.StagedDeletions, &s.StagedFiles,
			&s.FilesTouched, &s.RepoSizeBytes, &langJSON,
		); err != nil {
			return nil, fmt.Errorf("scan snapshot: %w", err)
		}

		id, err := parseUUID(idText)
		if err != nil {
			return nil, err
		}
		repoID, err := parseUUID(repoIDText)
		if err != nil {
			return nil, err
		}
		s.ID = id
		s.RepoID = repoID
		s.Branch = optionalString(branch)
		s.HeadSHA = optionalString(headSHA)
		s.UpstreamRef = optionalString(upstreamRef)
		s.UpstreamHeadSHA = optionalString(upstreamHeadSHA)

		s.ObservedAt, err = parseTime(observedAt)
		if err != nil {
			return nil, fmt.Errorf("scan snapshot observed_at: %w", err)
		}

		if err := decodeJSON(langJSON, &s.LanguageBreakdown); err != nil {
			s.LanguageBreakdown = nil
		}
		if s.LanguageBreakdown == nil {
			s.LanguageBreakdown = []models.LanguageStat{}
		}

		snaps = append(snaps, s)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return snaps, nil
}
