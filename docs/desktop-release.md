# Desktop Packaging And Release Expectations

This document defines the current supported desktop packaging story for GitPulse.
It exists so release work is explicit instead of implied by the presence of a Tauri shell.

## Current Supported Release Artifact

For now, the only documented desktop release artifact is an unsigned macOS application bundle:

- artifact type: `.app`
- host requirement: macOS
- bundle command shape: Tauri build with `--bundles app`
- expected output location: `target/*/release/bundle/macos/GitPulse.app`

The desktop shell is still intentionally thin and loads the same localhost runtime and web UI used by the CLI/web surface.

## What Is Not In Scope Yet

These are intentionally not part of the current supported release workflow:

- DMG generation as a required release artifact
- code signing
- notarization
- App Store packaging
- Windows or Linux installer documentation
- auto-update packaging or updater signing

If any of those become real product scope, update this file, `README.md`, `AGENTS.md`, and `BUILD.md` in the same pass.

## Release Host Requirements

Run desktop packaging on a macOS host with:

- the repo checked out
- the pinned Rust toolchain available
- Tauri CLI installed (`cargo-tauri`)

GitPulse does not currently assume `cargo-tauri` is present in every contributor environment. Packaging is an explicit release-host responsibility.

## Current Operator Flow

1. Reconfirm the desktop compile path:
   - `cargo check -p gitpulse-desktop`
2. Reconfirm desktop startup with the release-critical smoke gate:
   - `./scripts/desktop-smoke.sh`
3. Build the macOS app bundle:
   - `./scripts/desktop-package.sh`
4. Confirm the script reports a `.app` path under `target/*/release/bundle/macos/`
5. Launch the generated `.app` once on the release host before distributing it

## Helper Script

Use the checked-in helper instead of retyping the Tauri command:

```bash
./scripts/desktop-package.sh
```

The script:

- fails fast outside macOS
- fails fast if `cargo-tauri` is not installed
- runs the Tauri app-bundle build for `apps/gitpulse-desktop`
- reports the discovered `.app` bundle path when the build succeeds

Extra Tauri build arguments can be passed through, for example:

```bash
./scripts/desktop-package.sh --target universal-apple-darwin
```

## CI Expectation

CI currently proves only that the desktop crate compiles on `macos-latest`.
It does **not** currently build or publish bundles.
That is deliberate until the project chooses a real signing/notarization/release-distribution story.
