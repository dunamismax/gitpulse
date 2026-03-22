# BUILD.md

Short build and verification notes for GitPulse.

## Commands

```bash
cargo check --workspace --exclude gitpulse-desktop
cargo test --workspace --exclude gitpulse-desktop
cargo nextest run --workspace --exclude gitpulse-desktop
cargo clippy --workspace --all-targets --exclude gitpulse-desktop -- -D warnings
cargo run -p gitpulse-cli -- rebuild-rollups
cargo run -p gitpulse-cli -- doctor
cargo check -p gitpulse-desktop
./scripts/desktop-smoke.sh
```

## Notes

- `gitpulse-runtime` is the center of gravity
- keep live work, committed work, and pushed work separate in docs and code
- desktop is a thin shell over the localhost app, not a second product
