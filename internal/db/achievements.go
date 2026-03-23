package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// ReplaceAchievements truncates the achievements table and inserts fresh data
// in a single transaction.
func ReplaceAchievements(ctx context.Context, pool *pgxpool.Pool, achievements []models.Achievement) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, "DELETE FROM achievements"); err != nil {
		return fmt.Errorf("truncate achievements: %w", err)
	}

	for _, a := range achievements {
		_, err := tx.Exec(ctx, `
			INSERT INTO achievements (kind, unlocked_at_utc, day, reason)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (kind) DO NOTHING
		`, string(a.Kind), a.UnlockedAt.UTC(), a.Day, a.Reason)
		if err != nil {
			return fmt.Errorf("insert achievement %s: %w", a.Kind, err)
		}
	}

	return tx.Commit(ctx)
}

// ListAchievements returns all unlocked achievements ordered by unlock time.
func ListAchievements(ctx context.Context, pool *pgxpool.Pool) ([]models.Achievement, error) {
	rows, err := pool.Query(ctx, `
		SELECT kind, unlocked_at_utc, day, reason
		FROM achievements
		ORDER BY unlocked_at_utc ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var achievements []models.Achievement
	for rows.Next() {
		var a models.Achievement
		var kind string
		if err := rows.Scan(&kind, &a.UnlockedAt, &a.Day, &a.Reason); err != nil {
			return nil, fmt.Errorf("scan achievement: %w", err)
		}
		a.Kind = models.AchievementKind(kind)
		achievements = append(achievements, a)
	}
	return achievements, rows.Err()
}
