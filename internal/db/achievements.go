package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dunamismax/gitpulse/internal/models"
)

// ReplaceAchievements truncates the achievements table and inserts fresh data
// in a single transaction.
func ReplaceAchievements(ctx context.Context, db *sql.DB, achievements []models.Achievement) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, "DELETE FROM achievements"); err != nil {
		return fmt.Errorf("truncate achievements: %w", err)
	}

	for _, a := range achievements {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO achievements (kind, unlocked_at_utc, day, reason)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(kind) DO NOTHING
		`, string(a.Kind), formatTime(a.UnlockedAt), nullableString(a.Day), a.Reason); err != nil {
			return fmt.Errorf("insert achievement %s: %w", a.Kind, err)
		}
	}

	return tx.Commit()
}

// ListAchievements returns all unlocked achievements ordered by unlock time.
func ListAchievements(ctx context.Context, db *sql.DB) ([]models.Achievement, error) {
	rows, err := db.QueryContext(ctx, `
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
		var unlockedAt string
		var day sql.NullString
		var kind string

		if err := rows.Scan(&kind, &unlockedAt, &day, &a.Reason); err != nil {
			return nil, fmt.Errorf("scan achievement: %w", err)
		}
		a.Kind = models.AchievementKind(kind)
		a.Day = optionalString(day)
		parsed, err := parseTime(unlockedAt)
		if err != nil {
			return nil, fmt.Errorf("scan achievement unlocked_at: %w", err)
		}
		a.UnlockedAt = parsed
		achievements = append(achievements, a)
	}
	return achievements, rows.Err()
}
