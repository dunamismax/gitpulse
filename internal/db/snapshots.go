package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// InsertSnapshot stores a repository status snapshot.
func InsertSnapshot(ctx context.Context, pool *pgxpool.Pool, s models.RepoStatusSnapshot) error {
	langJSON, err := json.Marshal(s.LanguageBreakdown)
	if err != nil {
		return fmt.Errorf("marshal language breakdown: %w", err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO repo_status_snapshots
			(id, repo_id, observed_at_utc, branch, is_detached, head_sha,
			 upstream_ref, upstream_head_sha, ahead_count, behind_count,
			 live_additions, live_deletions, live_files,
			 staged_additions, staged_deletions, staged_files,
			 files_touched, repo_size_bytes, language_breakdown)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	`,
		s.ID, s.RepoID, s.ObservedAt.UTC(), s.Branch, s.IsDetached, s.HeadSHA,
		s.UpstreamRef, s.UpstreamHeadSHA, s.AheadCount, s.BehindCount,
		s.LiveAdditions, s.LiveDeletions, s.LiveFiles,
		s.StagedAdditions, s.StagedDeletions, s.StagedFiles,
		s.FilesTouched, s.RepoSizeBytes, langJSON,
	)
	return err
}

// LatestSnapshot returns the most recent snapshot for a repository.
func LatestSnapshot(ctx context.Context, pool *pgxpool.Pool, repoID uuid.UUID) (*models.RepoStatusSnapshot, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, repo_id, observed_at_utc, branch, is_detached, head_sha,
		       upstream_ref, upstream_head_sha, ahead_count, behind_count,
		       live_additions, live_deletions, live_files,
		       staged_additions, staged_deletions, staged_files,
		       files_touched, repo_size_bytes, language_breakdown
		FROM repo_status_snapshots
		WHERE repo_id = $1
		ORDER BY observed_at_utc DESC
		LIMIT 1
	`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
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
func RecentSnapshots(ctx context.Context, pool *pgxpool.Pool, repoID uuid.UUID, limit int) ([]models.RepoStatusSnapshot, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, repo_id, observed_at_utc, branch, is_detached, head_sha,
		       upstream_ref, upstream_head_sha, ahead_count, behind_count,
		       live_additions, live_deletions, live_files,
		       staged_additions, staged_deletions, staged_files,
		       files_touched, repo_size_bytes, language_breakdown
		FROM repo_status_snapshots
		WHERE repo_id = $1
		ORDER BY observed_at_utc DESC
		LIMIT $2
	`, repoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSnapshots(rows)
}

// AllSnapshotsForAnalytics loads the full snapshots table for analytics rebuild.
func AllSnapshotsForAnalytics(ctx context.Context, pool *pgxpool.Pool) ([]models.RepoStatusSnapshot, error) {
	rows, err := pool.Query(ctx, `
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
	defer rows.Close()
	return scanSnapshots(rows)
}

func scanSnapshots(rows pgx.Rows) ([]models.RepoStatusSnapshot, error) {
	var snaps []models.RepoStatusSnapshot
	for rows.Next() {
		var s models.RepoStatusSnapshot
		var langJSON []byte
		err := rows.Scan(
			&s.ID, &s.RepoID, &s.ObservedAt, &s.Branch, &s.IsDetached, &s.HeadSHA,
			&s.UpstreamRef, &s.UpstreamHeadSHA, &s.AheadCount, &s.BehindCount,
			&s.LiveAdditions, &s.LiveDeletions, &s.LiveFiles,
			&s.StagedAdditions, &s.StagedDeletions, &s.StagedFiles,
			&s.FilesTouched, &s.RepoSizeBytes, &langJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("scan snapshot: %w", err)
		}
		if err := json.Unmarshal(langJSON, &s.LanguageBreakdown); err != nil {
			s.LanguageBreakdown = nil
		}
		snaps = append(snaps, s)
	}
	return snaps, rows.Err()
}
