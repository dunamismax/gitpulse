# Desktop Packaging And Release Expectations

GitPulse does not currently ship a native desktop shell.

## Current truth

There is no supported desktop release artifact in this repository today.

What exists instead:

- a Go CLI
- a local web dashboard served by the same Go runtime
- documentation that reserves Zig/C as the only future native-shell direction if one is reintroduced

## What this means operationally

- do not document `.app`, DMG, MSI, or Linux desktop artifacts as if they exist
- do not add release steps that mention Cargo, Tauri, or Rust tooling
- do not imply CI validates desktop packaging today

## If native packaging returns later

Treat it as new work and update these files together:

- `README.md`
- `BUILD.md`
- `REWRITE_TRACKER.md`
- `docs/architecture.md`
- `.github/workflows/ci.yml`

A future native shell should stay thin and wrap the existing Go runtime rather than replace it.
