# GitPulse

GitPulse is a local-first Rust app for tracking git activity across one or many repositories. It watches live work, imports history, and serves the same localhost UI to the browser and desktop shell.

## Current state

- local web app plus thin Tauri desktop shell
- tracks live work, staged work, qualifying commits, local pushes, sessions, streaks, goals, score, and achievements
- focuses on metadata and analytics, not source upload

## Quick start

```bash
cargo run -p gitpulse-cli -- serve
cargo run -p gitpulse-cli -- add /path/to/repo-or-folder
cargo run -p gitpulse-cli -- import --all --days 30
cargo run -p gitpulse-cli -- doctor
cargo run -p gitpulse-desktop
```

## Notes

- live work, committed work, and pushed work stay separate
- CLI, web, and desktop flows share one Rust runtime
- GitHub verification is optional
