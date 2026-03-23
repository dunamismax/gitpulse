# PostgreSQL Conversion Tracker

Track the progress of converting the gitpulse database layer from SQLite (sqlx 0.8.6) to PostgreSQL.

## Status

All tasks completed.

## Checklist

### Schema and migrations

- [x] Replace `migrations/0001_init.sql` with PostgreSQL-dialect schema
  - UUID columns: `TEXT` -> `UUID`
  - Timestamp columns: `TEXT` -> `TIMESTAMPTZ`
  - Boolean columns: `INTEGER DEFAULT 0/1` -> `BOOLEAN DEFAULT FALSE/TRUE`
  - Numeric columns: `INTEGER` -> `BIGINT`
  - Date columns: `TEXT` -> `DATE`
  - Foreign key syntax: `FOREIGN KEY(col)` -> `FOREIGN KEY (col)`

### Workspace dependencies

- [x] `Cargo.toml`: sqlx features `sqlite` -> `postgres`
- [x] Removed all SQLite-specific sqlx feature flags

### Infrastructure layer (`crates/gitpulse-infra`)

- [x] `src/db.rs`: Replace `SqlitePool` with `PgPool`
- [x] `src/db.rs`: Replace `SqliteConnectOptions/SqlitePoolOptions` with `PgConnectOptions/PgPoolOptions`
- [x] `src/db.rs`: Remove SQLite PRAGMA statements
- [x] `src/db.rs`: Replace `.create_if_missing(true)` with PostgreSQL connection options
- [x] `src/db.rs`: Change `DatabasePaths { file: PathBuf }` to `DatabasePaths { url: String }`
- [x] `src/db.rs`: Replace all `?N` positional placeholders with `$N`
- [x] `src/db.rs`: Replace `INSERT OR IGNORE INTO` with `INSERT INTO ... ON CONFLICT (...) DO NOTHING`
- [x] `src/db.rs`: Fix `ON CONFLICT(key)` spacing to `ON CONFLICT (key)`
- [x] `src/db.rs`: Replace `fn map_*_row(row: sqlx::sqlite::SqliteRow)` with `sqlx::postgres::PgRow`
- [x] `src/db.rs`: Update `pool()` return type from `&SqlitePool` to `&PgPool`
- [x] `src/dirs.rs`: Remove `database_file: PathBuf` field
- [x] `src/config.rs`: Add `database_url: String` field with default `postgres://localhost/gitpulse`

### Runtime layer (`crates/gitpulse-runtime`)

- [x] `src/lib.rs`: Update `bootstrap_in` to use `file_config.database_url` instead of `paths.database_file`
- [x] `src/lib.rs`: Update `settings_view` to return `config.database_url` instead of `paths.database_file`
- [x] `src/lib.rs`: Update `doctor` to return `config.database_url` instead of `paths.database_file`
- [x] `tests/runtime_integration.rs`: Remove `database_file` from `test_paths`
- [x] `tests/runtime_integration.rs`: Add `create_test_db()` helper for per-test PostgreSQL database
- [x] `tests/runtime_integration.rs`: Replace all `?N` with `$N` in inline SQL
- [x] `tests/runtime_integration.rs`: Update `AppConfig` construction to include `database_url`

### Web layer (`crates/gitpulse-web`)

- [x] `tests/routes.rs`: Remove `database_file` from `test_paths`
- [x] `tests/routes.rs`: Add `create_test_db()` helper
- [x] `Cargo.toml`: Add `sqlx` and `uuid` dev-dependencies

### Configuration

- [x] `gitpulse.example.toml`: Add `database_url` option
- [x] `crates/gitpulse-infra/src/config.rs`: Register `database_url` default in `ConfigLoader`

### CI

- [x] `.github/workflows/ci.yml`: Add PostgreSQL service container
- [x] `.github/workflows/ci.yml`: Set `DATABASE_URL` environment variable for tests

### Documentation

- [x] `README.md`: Replace SQLite references with PostgreSQL
- [x] `README.md`: Update prerequisites section
- [x] `README.md`: Update platform paths table (remove `.sqlite3` references)
- [x] `README.md`: Update privacy section

## Notes

- Raw SQL only throughout. No ORM patterns introduced.
- All `?N` (SQLite positional) placeholders converted to `$N` (PostgreSQL positional).
- Boolean fields previously stored as INTEGER (0/1) are now native BOOLEAN in PostgreSQL.
- Timestamp fields previously stored as TEXT are now TIMESTAMPTZ.
- UUID fields previously stored as TEXT are now UUID type.
- Tests require a running PostgreSQL instance. Set `DATABASE_URL` to the admin connection URL
  (e.g. `postgres://localhost/postgres`). Each test creates and owns a unique database.
