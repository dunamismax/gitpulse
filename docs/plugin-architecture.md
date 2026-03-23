# Plugin Architecture (Planned)

This document describes a possible future extension system for GitPulse. It is a design note, not a description of existing functionality.

## Goals

- Allow third-party developers to extend GitPulse without forking the project.
- Keep the core runtime stable and secure while enabling experimentation at the edges.
- Make the plugin boundary clean enough that core upgrades do not break well-behaved plugins.
- Avoid the "everything is a plugin" trap; core functionality stays in core.

## Plugin capabilities

A plugin could declare one or more capabilities:

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

Two isolation approaches are under consideration.

### Option A: Separate process

- Plugin runs as a child process communicating via stdin/stdout JSON-RPC.
- Core sends events and queries; plugin responds with computed results.
- Crash isolation is free: a broken plugin cannot take down the host.
- Language-agnostic.
- Higher latency per call, but plugins are not on the hot path.

### Option B: WASM sandbox

- Plugin compiled to WASM and executed in a sandboxed runtime.
- Tighter integration and lower latency.
- Capability-based security.
- More complex host implementation.

**Current lean:** Option A first, with Option B only if it earns the complexity.

## Plugin lifecycle

1. **Discovery:** GitPulse scans a plugin directory under the app config/data root.
2. **Validation:** Manifest is parsed and capabilities are checked against the host version.
3. **Initialization:** Plugin process is started or WASM module is loaded. Handshake confirms protocol version.
4. **Registration:** Plugin registers its metrics, achievements, widgets, and data hooks with the host.
5. **Runtime:** Host sends events such as commits, session boundaries, and rollup rebuilds to interested plugins.
6. **Teardown:** On shutdown, host sends a graceful stop signal with a timeout for cleanup.

## Plugin data access

Plugins would receive read-only access to GitPulse data via a structured query interface:

- repository metadata (names, paths, patterns — not file contents)
- commit events (hashes, timestamps, stats — not diffs)
- push events
- session boundaries
- daily rollups
- achievement state

Plugins should **not** be allowed to:

- read file contents or diffs
- modify core database tables
- access the filesystem outside their plugin directory without explicit permission
- make network requests without declaring a network capability
- interact with other plugins directly without a host boundary

## Plugin storage

Plugins that need persistence should get an isolated storage area under the GitPulse app data root. The exact storage engine is undecided and should not be assumed yet.

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

Custom widgets would return data or HTML fragments that the local web dashboard can render inside a plugin container. If a future native shell exists, it should reuse the same web surface rather than invent a second plugin rendering model.

## Open questions

- Should plugins have a registry/marketplace, or is manual installation sufficient first?
- How should plugin updates work?
- Should plugin capabilities be granular or coarse?
- How should plugins interact with a future REST API?

## Prior art

- VS Code extensions
- Grafana plugins
- Obsidian plugins
- Telegraf plugins
