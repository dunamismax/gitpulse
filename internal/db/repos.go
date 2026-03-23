package db

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dunamismax/gitpulse/internal/models"
)

// UpsertRepository inserts or updates a repository record keyed on root_path.
func UpsertRepository(ctx context.Context, pool *pgxpool.Pool, r models.Repository) error {
	inclJSON, err := json.Marshal(r.IncludePatterns)
	if err != nil {
		return fmt.Errorf("marshal include patterns: %w", err)
	}
	exclJSON, err := json.Marshal(r.ExcludePatterns)
	if err != nil {
		return fmt.Errorf("marshal exclude patterns: %w", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO repositories
			(id, target_id, name, root_path, remote_url, default_branch,
			 include_patterns, exclude_patterns, is_monitored, state,
			 created_at_utc, updated_at_utc, last_error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (root_path) DO UPDATE SET
			name            = EXCLUDED.name,
			remote_url      = EXCLUDED.remote_url,
			default_branch  = EXCLUDED.default_branch,
			is_monitored    = EXCLUDED.is_monitored,
			state           = EXCLUDED.state,
			updated_at_utc  = EXCLUDED.updated_at_utc,
			last_error      = EXCLUDED.last_error
	`,
		r.ID, r.TargetID, r.Name, r.RootPath, r.RemoteURL, r.DefaultBranch,
		inclJSON, exclJSON, r.IsMonitored, string(r.State),
		r.CreatedAt.UTC(), r.UpdatedAt.UTC(), r.LastError,
	)
	return err
}

// ListRepositories returns all repositories ordered by name.
func ListRepositories(ctx context.Context, pool *pgxpool.Pool) ([]models.Repository, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, target_id, name, root_path, remote_url, default_branch,
		       include_patterns, exclude_patterns, is_monitored, state,
		       created_at_utc, updated_at_utc, last_error
		FROM repositories
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRepos(rows)
}

// GetRepository returns a single repository by its UUID.
func GetRepository(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*models.Repository, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, target_id, name, root_path, remote_url, default_branch,
		       include_patterns, exclude_patterns, is_monitored, state,
		       created_at_utc, updated_at_utc, last_error
		FROM repositories
		WHERE id = $1
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
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
func FindRepository(ctx context.Context, pool *pgxpool.Pool, selector string) (*models.Repository, error) {
	// Try exact UUID first.
	if id, err := uuid.Parse(selector); err == nil {
		return GetRepository(ctx, pool, id)
	}

	rows, err := pool.Query(ctx, `
		SELECT id, target_id, name, root_path, remote_url, default_branch,
		       include_patterns, exclude_patterns, is_monitored, state,
		       created_at_utc, updated_at_utc, last_error
		FROM repositories
		WHERE name = $1
		   OR root_path = $1
		   OR root_path LIKE $2
		ORDER BY name ASC
		LIMIT 1
	`, selector, selector+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
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
func SetRepositoryState(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, state models.RepositoryState, isMonitored bool) error {
	_, err := pool.Exec(ctx, `
		UPDATE repositories
		SET state = $2, is_monitored = $3, updated_at_utc = $4
		WHERE id = $1
	`, id, string(state), isMonitored, time.Now().UTC())
	return err
}

// SetRepositoryPatterns stores include/exclude glob patterns for a repository.
func SetRepositoryPatterns(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, include, exclude []string) error {
	inclJSON, err := json.Marshal(include)
	if err != nil {
		return fmt.Errorf("marshal include: %w", err)
	}
	exclJSON, err := json.Marshal(exclude)
	if err != nil {
		return fmt.Errorf("marshal exclude: %w", err)
	}
	_, err = pool.Exec(ctx, `
		UPDATE repositories
		SET include_patterns = $2, exclude_patterns = $3, updated_at_utc = $4
		WHERE id = $1
	`, id, inclJSON, exclJSON, time.Now().UTC())
	return err
}

// UpsertTrackedTarget inserts or updates a tracked target record.
func UpsertTrackedTarget(ctx context.Context, pool *pgxpool.Pool, t models.TrackedTarget) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO tracked_targets (id, path, kind, created_at_utc, last_scan_at_utc)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (path) DO UPDATE SET
			last_scan_at_utc = EXCLUDED.last_scan_at_utc
	`, t.ID, t.Path, t.Kind, t.CreatedAt.UTC(), t.LastScanAt)
	return err
}

// scanRepos reads repository rows into a slice.
func scanRepos(rows pgx.Rows) ([]models.Repository, error) {
	var repos []models.Repository
	for rows.Next() {
		var r models.Repository
		var inclJSON, exclJSON []byte
		var state string

		err := rows.Scan(
			&r.ID, &r.TargetID, &r.Name, &r.RootPath, &r.RemoteURL, &r.DefaultBranch,
			&inclJSON, &exclJSON, &r.IsMonitored, &state,
			&r.CreatedAt, &r.UpdatedAt, &r.LastError,
		)
		if err != nil {
			return nil, fmt.Errorf("scan repo: %w", err)
		}
		r.State = models.RepositoryState(state)
		if err := json.Unmarshal(inclJSON, &r.IncludePatterns); err != nil {
			r.IncludePatterns = nil
		}
		if err := json.Unmarshal(exclJSON, &r.ExcludePatterns); err != nil {
			r.ExcludePatterns = nil
		}
		// Ensure nil slices become empty slices for consistent behavior.
		if r.IncludePatterns == nil {
			r.IncludePatterns = []string{}
		}
		if r.ExcludePatterns == nil {
			r.ExcludePatterns = []string{}
		}
		repos = append(repos, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Keep the compiler happy about the strings import.
	_ = strings.ToLower
	return repos, nil
}
