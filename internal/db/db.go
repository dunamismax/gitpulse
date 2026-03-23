// Package db provides PostgreSQL access via pgx/v5 connection pools.
package db

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQLBytes []byte

// Connect creates and validates a pgxpool connection pool.
func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DSN: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return pool, nil
}

// RunMigrations executes the initial schema migration idempotently.
// All CREATE TABLE/INDEX statements use IF NOT EXISTS, so this is safe to
// call on every startup.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, string(schemaSQLBytes))
	if err != nil {
		return fmt.Errorf("run migration: %w", err)
	}
	return nil
}
