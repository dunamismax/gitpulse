package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableUUID(value *uuid.UUID) any {
	if value == nil {
		return nil
	}
	return value.String()
}

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return formatTime(*value)
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("timestamp is empty")
	}

	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05Z07:00",
	} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed.UTC(), nil
		}
	}

	return time.Time{}, fmt.Errorf("parse time %q: unsupported format", value)
}

func parseUUID(value string) (uuid.UUID, error) {
	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse uuid %q: %w", value, err)
	}
	return id, nil
}

func parseOptionalUUID(value sql.NullString) (*uuid.UUID, error) {
	if !value.Valid || value.String == "" {
		return nil, nil
	}
	id, err := parseUUID(value.String)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func optionalString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	v := value.String
	return &v
}

func decodeJSON(raw string, target any) error {
	if raw == "" {
		raw = "[]"
	}
	if err := json.Unmarshal([]byte(raw), target); err != nil {
		return fmt.Errorf("decode json: %w", err)
	}
	return nil
}

func encodeJSON(value any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("encode json: %w", err)
	}
	return string(raw), nil
}
