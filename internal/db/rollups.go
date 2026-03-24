package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// ReplaceDailyRollups truncates the daily_rollups table and inserts fresh data
// in a single transaction. Rollups are fully derived, so truncate-replace is correct.
func ReplaceDailyRollups(ctx context.Context, db *sql.DB, rollups []models.DailyRollup) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, "DELETE FROM daily_rollups"); err != nil {
		return fmt.Errorf("truncate rollups: %w", err)
	}

	for _, r := range rollups {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO daily_rollups
				(scope, day, live_additions, live_deletions,
				 staged_additions, staged_deletions,
				 committed_additions, committed_deletions,
				 commits, pushes, focus_minutes, files_touched, languages_touched, score)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			r.Scope, r.Day,
			r.LiveAdditions, r.LiveDeletions,
			r.StagedAdditions, r.StagedDeletions,
			r.CommittedAdditions, r.CommittedDeletions,
			r.Commits, r.Pushes, r.FocusMinutes,
			r.FilesTouched, r.LanguagesTouched, r.Score,
		); err != nil {
			return fmt.Errorf("insert rollup (%s, %s): %w", r.Scope, r.Day, err)
		}
	}

	return tx.Commit()
}

// ListDailyRollups returns recent rollups. repoID nil means scope "all".
// days is the maximum number of calendar days to return.
func ListDailyRollups(ctx context.Context, db *sql.DB, repoID *uuid.UUID, days int) ([]models.DailyRollup, error) {
	scope := "all"
	if repoID != nil {
		scope = repoID.String()
	}

	rows, err := db.QueryContext(ctx, `
		SELECT scope, day, live_additions, live_deletions,
		       staged_additions, staged_deletions,
		       committed_additions, committed_deletions,
		       commits, pushes, focus_minutes, files_touched, languages_touched, score
		FROM daily_rollups
		WHERE scope = ?
		ORDER BY day DESC
		LIMIT ?
	`, scope, days)
	if err != nil {
		return nil, err
	}
	return scanRollups(rows)
}

// AllRollupsForScope returns all rollups for a given scope string.
func AllRollupsForScope(ctx context.Context, db *sql.DB, scope string) ([]models.DailyRollup, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT scope, day, live_additions, live_deletions,
		       staged_additions, staged_deletions,
		       committed_additions, committed_deletions,
		       commits, pushes, focus_minutes, files_touched, languages_touched, score
		FROM daily_rollups
		WHERE scope = ?
		ORDER BY day ASC
	`, scope)
	if err != nil {
		return nil, err
	}
	return scanRollups(rows)
}

func scanRollups(rows *sql.Rows) (_ []models.DailyRollup, err error) {
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close rollup rows: %w", closeErr)
		}
	}()

	var rollups []models.DailyRollup
	for rows.Next() {
		var r models.DailyRollup
		if err := rows.Scan(
			&r.Scope, &r.Day,
			&r.LiveAdditions, &r.LiveDeletions,
			&r.StagedAdditions, &r.StagedDeletions,
			&r.CommittedAdditions, &r.CommittedDeletions,
			&r.Commits, &r.Pushes, &r.FocusMinutes,
			&r.FilesTouched, &r.LanguagesTouched, &r.Score,
		); err != nil {
			return nil, fmt.Errorf("scan rollup: %w", err)
		}
		rollups = append(rollups, r)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return rollups, nil
}
