# GitPulse Metrics

GitPulse separates live work, committed work, and pushed work on purpose.

## Live Changed Lines

Definition:

- Additions/deletions between the working tree and `HEAD` for tracked text files
- Plus untracked text files counted as additions only
- Excludes binaries, oversized untracked files, and configured noisy/generated paths

Interpretation:

- This is a current-work snapshot, not a value judgement
- It can rise and fall throughout the day as you edit or discard work

## Staged Changed Lines

Definition:

- Additions/deletions between the git index and `HEAD`

Interpretation:

- This is the portion of your current work that is staged for a commit

## Commit Totals

Definition:

- Additions/deletions from commits authored by configured identities
- Imported from recent git history and refreshed from ongoing repo activity
- Merge commits are stored but excluded from score and daily totals by default

Identity handling:

- GitPulse auto-detects the default git author when possible
- You can add more author emails in settings
- Identity aliases affect commit and push history totals
- Live local activity is never filtered by author identity

## Push Totals

Definition:

- GitPulse tracks upstream/ahead-behind state over time
- When the ahead count drops, it records `push_detected_local`
- If GitHub verification is enabled and the remote is GitHub, it may also record `push_remote_confirmed`

Interpretation:

- Push detection works without git hooks
- Remote confirmation is optional, not required for the feature to exist

## Repo Size Snapshot

Definition:

- Current language totals using `tokei`
- Stored periodically, not on every file save
- Tracks code/comment/blank counts by language

## Files Touched

Definition:

- Unique relative paths observed through imported commit stats and meaningful refresh snapshots

## Focus Sessions

Definition:

- Contiguous activity windows separated by 15+ minutes of inactivity by default
- Activity includes refreshes with meaningful changes, commits, pushes, imports, and rescans

## Streaks

A day qualifies when any of the default thresholds are met:

- at least 1 qualifying commit
- or at least 100 changed live lines
- or at least 25 focus minutes

## Score

Score is separate from raw stats.

Current default formula:

- `floor(live_changed_lines / 20)`
- `+ 50 * commits`
- `+ 80 * pushes`
- `+ 2 * focus_minutes`

The intent is to reward momentum while staying understandable. Score is not a proxy for code quality or developer value.

## Exclusions And Noise Reduction

GitPulse excludes common noisy paths by default, including:

- `.git`
- `target`
- `node_modules`
- `dist`
- `build`
- `.next`
- `coverage`
- `vendor`
- lockfiles
- minified assets
- common binary/large asset extensions

You can also configure include/exclude globs globally and add repo-specific overrides.

Repo-specific override caveat:

- Excludes still win over includes after the global and repo-specific lists are combined
- Saving repo-specific patterns affects future refreshes and imports, but does not rewrite older stored file-activity events

## Timezone And Day Boundary

- Timestamps are stored internally in UTC
- Daily rollups are computed using the configured timezone and day-boundary offset
- This matters for streaks, goals, and “today” summaries

## LOC Caveat

Line counts are intentionally treated as approximate operational telemetry.

- They are useful for momentum and pattern detection
- They are not a measure of quality, complexity, or impact
- They can be skewed by formatting, generated files, large refactors, or deletions
