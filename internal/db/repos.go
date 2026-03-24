package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// UpsertRepository inserts or updates a repository record keyed on root_path.
func UpsertRepository(ctx context.Context, db *sql.DB, r models.Repository) error {
	inclJSON, err := encodeJSON(r.IncludePatterns)
	if err != nil {
		return fmt.Errorf("marshal include patterns: %w", err)
	}
	exclJSON, err := encodeJSON(r.ExcludePatterns)
	if err != nil {
		return fmt.Errorf("marshal exclude patterns: %w", err)
	}

	_, err = db.ExecContext(ctx, `
		INSERT INTO repositories
			(id, target_id, name, root_path, remote_url, default_branch,
			 include_patterns, exclude_patterns, is_monitored, state,
			 created_at_utc, updated_at_utc, last_error)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(root_path) DO UPDATE SET
			name = excluded.name,
			remote_url = excluded.remote_url,
			default_branch = excluded.default_branch,
			is_monitored = excluded.is_monitored,
			state = excluded.state,
			updated_at_utc = excluded.updated_at_utc,
			last_error = excluded.last_error
	`,
		r.ID.String(), nullableUUID(r.TargetID), r.Name, r.RootPath, nullableString(r.RemoteURL), nullableString(r.DefaultBranch),
		inclJSON, exclJSON, r.IsMonitored, string(r.State),
		formatTime(r.CreatedAt), formatTime(r.UpdatedAt), nullableString(r.LastError),
	)
	return err
}

// ListRepositories returns all repositories ordered by name.
func ListRepositories(ctx context.Context, db *sql.DB) ([]models.Repository, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, target_id, name, root_path, remote_url, default_branch,
		       include_patterns, exclude_patterns, is_monitored, state,
		       created_at_utc, updated_at_utc, last_error
		FROM repositories
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	return scanRepos(rows)
}

// GetRepository returns a single repository by its UUID.
func GetRepository(ctx context.Context, db *sql.DB, id uuid.UUID) (*models.Repository, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, target_id, name, root_path, remote_url, default_branch,
		       include_patterns, exclude_patterns, is_monitored, state,
		       created_at_utc, updated_at_utc, last_error
		FROM repositories
		WHERE id = ?
	`, id.String())
	if err != nil {
		return nil, err
	}
	repos, err := scanRepos(rows)
	if err != nil {
		return nil, err
	}
	if len(repos) == 0 {
		return nil, nil
	}
	return &repos[0], nil
}

// FindRepository locates a repository by UUID string, name, or root_path prefix.
func FindRepository(ctx context.Context, db *sql.DB, selector string) (*models.Repository, error) {
	if id, err := uuid.Parse(selector); err == nil {
		return GetRepository(ctx, db, id)
	}

	rows, err := db.QueryContext(ctx, `
		SELECT id, target_id, name, root_path, remote_url, default_branch,
		       include_patterns, exclude_patterns, is_monitored, state,
		       created_at_utc, updated_at_utc, last_error
		FROM repositories
		WHERE name = ?
		   OR root_path = ?
		   OR root_path LIKE ?
		ORDER BY name ASC
		LIMIT 1
	`, selector, selector, selector+"%")
	if err != nil {
		return nil, err
	}
	repos, err := scanRepos(rows)
	if err != nil {
		return nil, err
	}
	if len(repos) == 0 {
		return nil, nil
	}
	return &repos[0], nil
}

// SetRepositoryState updates a repository's state and monitoring flag.
func SetRepositoryState(ctx context.Context, db *sql.DB, id uuid.UUID, state models.RepositoryState, isMonitored bool) error {
	_, err := db.ExecContext(ctx, `
		UPDATE repositories
		SET state = ?, is_monitored = ?, updated_at_utc = ?
		WHERE id = ?
	`, string(state), isMonitored, formatTime(time.Now().UTC()), id.String())
	return err
}

// SetRepositoryPatterns stores include/exclude glob patterns for a repository.
func SetRepositoryPatterns(ctx context.Context, db *sql.DB, id uuid.UUID, include, exclude []string) error {
	inclJSON, err := encodeJSON(include)
	if err != nil {
		return fmt.Errorf("marshal include: %w", err)
	}
	exclJSON, err := encodeJSON(exclude)
	if err != nil {
		return fmt.Errorf("marshal exclude: %w", err)
	}
	_, err = db.ExecContext(ctx, `
		UPDATE repositories
		SET include_patterns = ?, exclude_patterns = ?, updated_at_utc = ?
		WHERE id = ?
	`, inclJSON, exclJSON, formatTime(time.Now().UTC()), id.String())
	return err
}

// UpsertTrackedTarget inserts or updates a tracked target record.
func UpsertTrackedTarget(ctx context.Context, db *sql.DB, t models.TrackedTarget) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO tracked_targets (id, path, kind, created_at_utc, last_scan_at_utc)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			last_scan_at_utc = excluded.last_scan_at_utc
	`, t.ID.String(), t.Path, t.Kind, formatTime(t.CreatedAt), nullableTime(t.LastScanAt))
	return err
}

func scanRepos(rows *sql.Rows) (_ []models.Repository, err error) {
	defer func() {
		if closeErr := rows.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close repository rows: %w", closeErr)
		}
	}()

	var repos []models.Repository
	for rows.Next() {
		var r models.Repository
		var idText string
		var targetID sql.NullString
		var remoteURL sql.NullString
		var defaultBranch sql.NullString
		var inclJSON string
		var exclJSON string
		var state string
		var createdAt string
		var updatedAt string
		var lastError sql.NullString

		if err := rows.Scan(
			&idText, &targetID, &r.Name, &r.RootPath, &remoteURL, &defaultBranch,
			&inclJSON, &exclJSON, &r.IsMonitored, &state,
			&createdAt, &updatedAt, &lastError,
		); err != nil {
			return nil, fmt.Errorf("scan repo: %w", err)
		}

		id, err := parseUUID(idText)
		if err != nil {
			return nil, err
		}
		r.ID = id

		r.TargetID, err = parseOptionalUUID(targetID)
		if err != nil {
			return nil, err
		}
		r.RemoteURL = optionalString(remoteURL)
		r.DefaultBranch = optionalString(defaultBranch)
		r.LastError = optionalString(lastError)
		r.State = models.RepositoryState(state)

		r.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, fmt.Errorf("scan repo created_at: %w", err)
		}
		r.UpdatedAt, err = parseTime(updatedAt)
		if err != nil {
			return nil, fmt.Errorf("scan repo updated_at: %w", err)
		}

		if err := decodeJSON(inclJSON, &r.IncludePatterns); err != nil {
			r.IncludePatterns = []string{}
		}
		if err := decodeJSON(exclJSON, &r.ExcludePatterns); err != nil {
			r.ExcludePatterns = []string{}
		}
		if r.IncludePatterns == nil {
			r.IncludePatterns = []string{}
		}
		if r.ExcludePatterns == nil {
			r.ExcludePatterns = []string{}
		}

		repos = append(repos, r)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return repos, nil
}
