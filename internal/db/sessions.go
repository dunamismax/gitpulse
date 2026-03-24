package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// ReplaceFocusSessions truncates the focus_sessions table and inserts fresh
// data in a single transaction. Focus sessions are fully derived, so
// truncate-replace is always correct.
func ReplaceFocusSessions(ctx context.Context, db *sql.DB, sessions []models.FocusSession) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx, "DELETE FROM focus_sessions"); err != nil {
		return fmt.Errorf("truncate sessions: %w", err)
	}

	for _, s := range sessions {
		repoJSON, err := encodeJSON(uuidSliceToStrings(s.RepoIDs))
		if err != nil {
			return fmt.Errorf("marshal repo_ids: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO focus_sessions
				(id, started_at_utc, ended_at_utc, active_minutes, repo_ids, event_count, total_changed_lines)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`,
			s.ID.String(), formatTime(s.StartedAt), formatTime(s.EndedAt), s.ActiveMinutes,
			repoJSON, s.EventCount, s.TotalChangedLines,
		); err != nil {
			return fmt.Errorf("insert session: %w", err)
		}
	}

	return tx.Commit()
}

// ListFocusSessions returns recent focus sessions ordered by start time descending.
func ListFocusSessions(ctx context.Context, db *sql.DB, limit int) (_ []models.FocusSession, err error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, started_at_utc, ended_at_utc, active_minutes, repo_ids, event_count, total_changed_lines
		FROM focus_sessions
		ORDER BY started_at_utc DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close focus session rows: %w", closeErr)
		}
	}()

	var sessions []models.FocusSession
	for rows.Next() {
		var s models.FocusSession
		var idText string
		var startedAt string
		var endedAt string
		var repoJSON string

		if err := rows.Scan(
			&idText, &startedAt, &endedAt, &s.ActiveMinutes,
			&repoJSON, &s.EventCount, &s.TotalChangedLines,
		); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}

		id, err := parseUUID(idText)
		if err != nil {
			return nil, err
		}
		s.ID = id
		s.StartedAt, err = parseTime(startedAt)
		if err != nil {
			return nil, fmt.Errorf("scan session started_at: %w", err)
		}
		s.EndedAt, err = parseTime(endedAt)
		if err != nil {
			return nil, fmt.Errorf("scan session ended_at: %w", err)
		}

		var idStrs []string
		if err := decodeJSON(repoJSON, &idStrs); err == nil {
			s.RepoIDs = stringsToUUIDSlice(idStrs)
		}

		sessions = append(sessions, s)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return sessions, nil
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
