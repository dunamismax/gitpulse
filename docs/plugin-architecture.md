# Plugin Architecture (Planned)

This document describes the planned extension system for GitPulse. It is a design document, not a description of existing functionality.

## Goals

- Allow third-party developers to extend GitPulse without forking the project.
- Keep the core runtime stable and secure while enabling experimentation at the edges.
- Make the plugin boundary clean enough that core upgrades don't break well-behaved plugins.
- Avoid the "everything is a plugin" trap — core functionality stays in core.

## Plugin capabilities

A plugin can declare one or more capabilities:

| Capability | Description | Example |
|------------|-------------|---------|
| `custom_metric` | Define a new metric computed from existing event data | "Review turnaround time" |
| `custom_achievement` | Define new achievement types and unlock conditions | "Weekend warrior: 5 weekend commits" |
| `custom_widget` | Add a dashboard widget rendered from plugin-provided data | "PR status board" |
| `data_source` | Bring in data from external systems | "Import from Jira/Linear" |
| `export` | Export analytics data in custom formats | "Weekly Markdown digest" |
| `notification` | Define custom notification triggers and delivery | "Slack alerts on streak milestones" |

## Plugin manifest

Plugins declare themselves via a `gitpulse-plugin.toml` manifest:

```toml
[plugin]
name = "weekend-warrior"
version = "0.1.0"
description = "Achievement pack for weekend coding patterns"
authors = ["Plugin Author"]
license = "MIT"
min_gitpulse_version = "2.0.0"

[[capabilities]]
type = "custom_achievement"

[[capabilities]]
type = "custom_widget"
```

## Isolation model

Two isolation approaches are under consideration:

### Option A: Separate process (simpler, safer)

- Plugin runs as a child process communicating via stdin/stdout JSON-RPC.
- Core sends events and queries; plugin responds with computed results.
- Crash isolation is free — a broken plugin can't take down the host.
- Language-agnostic — plugins can be written in any language.
- Higher latency per call, but plugins are not on the hot path.

### Option B: WASM sandbox (more portable)

- Plugin compiled to WASM and executed in a sandboxed runtime (wasmtime or wasmer).
- Tighter integration, lower latency.
- Capability-based security — plugins declare what they need access to.
- Constrained to languages that compile to WASM.
- More complex host implementation.

**Current lean:** Option A for v2 (simplicity and language flexibility), with Option B as a future optimization path.

## Plugin lifecycle

1. **Discovery:** GitPulse scans `~/.config/gitpulse/plugins/` for plugin directories containing `gitpulse-plugin.toml`.
2. **Validation:** Manifest is parsed and capabilities are checked against the host version.
3. **Initialization:** Plugin process is started (or WASM module loaded). Handshake confirms protocol version.
4. **Registration:** Plugin registers its metrics, achievements, widgets, etc. with the host.
5. **Runtime:** Host sends events (new commits, session boundaries, rollup rebuilds) to interested plugins. Plugins respond with computed data.
6. **Teardown:** On shutdown, host sends a graceful stop signal. Plugins have a timeout to clean up.

## Plugin data access

Plugins receive read-only access to GitPulse data via a structured query interface:

- Repository metadata (names, paths, patterns — not file contents)
- Commit events (hashes, timestamps, stats — not diffs)
- Push events
- Session boundaries
- Daily rollups
- Achievement state

Plugins **cannot**:
- Read file contents or diffs
- Modify core database tables
- Access the filesystem outside their plugin directory
- Make network requests without declaring the `network` capability
- Interact with other plugins directly

## Plugin storage

Plugins that need persistence get a dedicated SQLite database file:

```
~/.config/gitpulse/plugins/<plugin-name>/plugin.sqlite3
```

The host manages the lifecycle of this file. Uninstalling a plugin offers to delete its data.

## CLI interface

```bash
# Install a plugin from a local path or registry
gitpulse plugin install ./my-plugin
gitpulse plugin install weekend-warrior

# List installed plugins
gitpulse plugin list

# Remove a plugin
gitpulse plugin remove weekend-warrior

# Show plugin info
gitpulse plugin info weekend-warrior
```

## Dashboard integration

Custom widgets declare their rendering interface:

- For the web dashboard: plugins return HTML fragments that are embedded in a plugin widget container.
- For the desktop app: same HTML fragments rendered in the Tauri webview.
- Widget dimensions and placement are configurable by the user.

## Open questions

- Should plugins have a registry/marketplace, or is manual installation sufficient for v2?
- How should plugin updates work? Auto-update vs manual?
- Should plugin capabilities be granular (per-endpoint API access) or coarse (read-only vs read-write)?
- How do plugins interact with the REST API? Do they extend it, or only consume it?

## Prior art

- VS Code extensions (marketplace, activation events, contribution points)
- Grafana plugins (panel, data source, app types with sandboxed execution)
- Obsidian plugins (community marketplace, manifest-driven, JS-based)
- Telegraf plugins (Go interface-based, compiled in)

GitPulse's model is closest to VS Code's contribution-point system crossed with Grafana's typed plugin categories, but with process-level isolation instead of in-process loading.
