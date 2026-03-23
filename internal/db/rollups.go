package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// ReplaceDailyRollups truncates the daily_rollups table and inserts fresh data
// in a single transaction. Rollups are fully derived, so truncate-replace is correct.
func ReplaceDailyRollups(ctx context.Context, pool *pgxpool.Pool, rollups []models.DailyRollup) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, "DELETE FROM daily_rollups"); err != nil {
		return fmt.Errorf("truncate rollups: %w", err)
	}

	for _, r := range rollups {
		_, err := tx.Exec(ctx, `
			INSERT INTO daily_rollups
				(scope, day, live_additions, live_deletions,
				 staged_additions, staged_deletions,
				 committed_additions, committed_deletions,
				 commits, pushes, focus_minutes, files_touched, languages_touched, score)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		`,
			r.Scope, r.Day,
			r.LiveAdditions, r.LiveDeletions,
			r.StagedAdditions, r.StagedDeletions,
			r.CommittedAdditions, r.CommittedDeletions,
			r.Commits, r.Pushes, r.FocusMinutes,
			r.FilesTouched, r.LanguagesTouched, r.Score,
		)
		if err != nil {
			return fmt.Errorf("insert rollup (%s, %s): %w", r.Scope, r.Day, err)
		}
	}

	return tx.Commit(ctx)
}

// ListDailyRollups returns recent rollups. repoID nil means scope "all".
// days is the maximum number of calendar days to return.
func ListDailyRollups(ctx context.Context, pool *pgxpool.Pool, repoID *uuid.UUID, days int) ([]models.DailyRollup, error) {
	var scope string
	if repoID != nil {
		scope = repoID.String()
	} else {
		scope = "all"
	}

	rows, err := pool.Query(ctx, `
		SELECT scope, day, live_additions, live_deletions,
		       staged_additions, staged_deletions,
		       committed_additions, committed_deletions,
		       commits, pushes, focus_minutes, files_touched, languages_touched, score
		FROM daily_rollups
		WHERE scope = $1
		ORDER BY day DESC
		LIMIT $2
	`, scope, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRollups(rows)
}

// AllRollupsForScope returns all rollups for a given scope string.
func AllRollupsForScope(ctx context.Context, pool *pgxpool.Pool, scope string) ([]models.DailyRollup, error) {
	rows, err := pool.Query(ctx, `
		SELECT scope, day, live_additions, live_deletions,
		       staged_additions, staged_deletions,
		       committed_additions, committed_deletions,
		       commits, pushes, focus_minutes, files_touched, languages_touched, score
		FROM daily_rollups
		WHERE scope = $1
		ORDER BY day ASC
	`, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRollups(rows)
}

func scanRollups(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
	Close()
}) ([]models.DailyRollup, error) {
	var rollups []models.DailyRollup
	for rows.Next() {
		var r models.DailyRollup
		err := rows.Scan(
			&r.Scope, &r.Day,
			&r.LiveAdditions, &r.LiveDeletions,
			&r.StagedAdditions, &r.StagedDeletions,
			&r.CommittedAdditions, &r.CommittedDeletions,
			&r.Commits, &r.Pushes, &r.FocusMinutes,
			&r.FilesTouched, &r.LanguagesTouched, &r.Score,
		)
		if err != nil {
			return nil, fmt.Errorf("scan rollup: %w", err)
		}
		rollups = append(rollups, r)
	}
	return rollups, rows.Err()
}
