#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd "$REPO_ROOT"

export GITPULSE_DESKTOP_SMOKE_TEST="${GITPULSE_DESKTOP_SMOKE_TEST:-1}"
export GITPULSE_DESKTOP_SMOKE_TIMEOUT_SECS="${GITPULSE_DESKTOP_SMOKE_TIMEOUT_SECS:-20}"
export GITPULSE_DESKTOP_SMOKE_POLL_MS="${GITPULSE_DESKTOP_SMOKE_POLL_MS:-250}"

cargo run -p gitpulse-desktop
