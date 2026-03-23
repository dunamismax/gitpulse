# Changelog

All notable changes to GitPulse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Document the repository truth as Go + PostgreSQL + raw SQL + local web UI only.
- Align README, BUILD, rewrite tracker, architecture notes, and contributor docs with the current stack.
- Remove Tauri-specific folder-picker behavior from the remaining frontend helper script.

### Removed
- Legacy Rust/Tauri workspace under `apps/` and `crates/`.
- Cargo manifests, Rust toolchain/config files, and Rust-era desktop helper scripts.
- Stale docs that implied a supported Rust/Tauri desktop packaging workflow.
