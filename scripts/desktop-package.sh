#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "desktop-package.sh currently supports macOS app bundle builds only" >&2
  exit 1
fi

cd "$REPO_ROOT"

if ! cargo tauri build --help >/dev/null 2>&1; then
  cat >&2 <<'EOF'
cargo-tauri is required for desktop bundle builds.
Install it on the macOS release host before running this script.
Example:
  cargo install cargo-tauri --locked
EOF
  exit 1
fi

cargo tauri build --manifest-path apps/gitpulse-desktop/Cargo.toml --bundles app "$@"

bundle_path="$({ find "$REPO_ROOT/target" -type d -path '*/release/bundle/macos/GitPulse.app' -print -quit; } || true)"
if [[ -z "$bundle_path" ]]; then
  echo "desktop bundle build completed, but GitPulse.app was not found under target/*/release/bundle/macos" >&2
  exit 1
fi

printf 'GitPulse desktop app bundle ready: %s\n' "$bundle_path"
