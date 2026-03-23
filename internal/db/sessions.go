package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// ReplaceFocusSessions truncates the focus_sessions table and inserts fresh
// data in a single transaction. Focus sessions are fully derived, so
// truncate-replace is always correct.
func ReplaceFocusSessions(ctx context.Context, pool *pgxpool.Pool, sessions []models.FocusSession) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, "DELETE FROM focus_sessions"); err != nil {
		return fmt.Errorf("truncate sessions: %w", err)
	}

	for _, s := range sessions {
		repoJSON, err := json.Marshal(uuidSliceToStrings(s.RepoIDs))
		if err != nil {
			return fmt.Errorf("marshal repo_ids: %w", err)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO focus_sessions
				(id, started_at_utc, ended_at_utc, active_minutes, repo_ids, event_count, total_changed_lines)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
		`,
			s.ID, s.StartedAt.UTC(), s.EndedAt.UTC(), s.ActiveMinutes,
			repoJSON, s.EventCount, s.TotalChangedLines,
		)
		if err != nil {
			return fmt.Errorf("insert session: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// ListFocusSessions returns recent focus sessions ordered by start time descending.
func ListFocusSessions(ctx context.Context, pool *pgxpool.Pool, limit int) ([]models.FocusSession, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, started_at_utc, ended_at_utc, active_minutes, repo_ids, event_count, total_changed_lines
		FROM focus_sessions
		ORDER BY started_at_utc DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []models.FocusSession
	for rows.Next() {
		var s models.FocusSession
		var repoJSON []byte
		if err := rows.Scan(
			&s.ID, &s.StartedAt, &s.EndedAt, &s.ActiveMinutes,
			&repoJSON, &s.EventCount, &s.TotalChangedLines,
		); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		var idStrs []string
		if err := json.Unmarshal(repoJSON, &idStrs); err == nil {
			s.RepoIDs = stringsToUUIDSlice(idStrs)
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

func uuidSliceToStrings(ids []uuid.UUID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = id.String()
	}
	return out
}

func stringsToUUIDSlice(strs []string) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(strs))
	for _, s := range strs {
		if id, err := uuid.Parse(s); err == nil {
			out = append(out, id)
		}
	}
	return out
}
