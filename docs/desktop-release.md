# Desktop Release Expectations

GitPulse currently ships as a Go CLI and local web dashboard.

## Current truth

There is no platform-specific packaged desktop release workflow in this repository today.

What exists instead:

- a Go CLI
- a local web dashboard served by the same runtime
- CI that validates tests and CLI build smoke for the Go path

## What this means operationally

- do not document `.app`, DMG, MSI, or Linux desktop artifacts as if they exist
- do not add release steps unless the repo actually implements them
- do not imply CI validates packaged desktop distribution today

## If packaged releases are added later

Treat them as new work and update these files together:

- `README.md`
- `docs/operator-workflow.md`
- `docs/architecture.md`
- `.github/workflows/ci.yml`
