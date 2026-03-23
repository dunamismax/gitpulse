package git

import (
	"context"
	"strconv"
	"strings"

	"github.com/dunamismax/gitpulse/internal/filter"
	"github.com/dunamismax/gitpulse/internal/models"
)

// GitStatusSnapshot is the point-in-time state of a git repository.
type GitStatusSnapshot struct {
	Branch            *string
	IsDetached        bool
	HeadSHA           *string
	UpstreamRef       *string
	UpstreamHeadSHA   *string
	AheadCount        int
	BehindCount       int
	LiveStats         models.DiffStats
	StagedStats       models.DiffStats
	TouchedPaths      []TouchedPath
	RepoSizeBytes     int64
	LanguageBreakdown []models.LanguageStat
}

// SnapshotRepository captures the current git state of a repository.
func SnapshotRepository(ctx context.Context, repoRoot string, f *filter.PathFilter, includeSizeScan bool) (*GitStatusSnapshot, error) {
	snap := &GitStatusSnapshot{}

	// Parse porcelain v2 status for branch info and untracked files.
	statusOut, err := run(ctx, repoRoot, "status", "--porcelain=v2", "--branch", "--untracked-files=all")
	if err != nil {
		return nil, err
	}
	parseStatus(statusOut, snap)

	// Live (unstaged) diff.
	liveOut, err := run(ctx, repoRoot, "diff", "--numstat")
	if err == nil {
		snap.LiveStats, _, _ = parseNumstat(liveOut, f)
	}

	// Staged diff.
	stagedOut, err := run(ctx, repoRoot, "diff", "--cached", "--numstat")
	if err == nil {
		snap.StagedStats, snap.TouchedPaths, _ = parseNumstat(stagedOut, f)
	}

	// Merge touched paths from live diff.
	if liveStats, liveTouched, err := parseNumstat(liveOut, f); err == nil {
		_ = liveStats
		snap.TouchedPaths = append(snap.TouchedPaths, liveTouched...)
	}

	return snap, nil
}

// parseStatus parses `git status --porcelain=v2 --branch` output into the snapshot.
func parseStatus(output string, snap *GitStatusSnapshot) {
	for _, line := range strings.Split(output, "\n") {
		if strings.HasPrefix(line, "# branch.head ") {
			val := strings.TrimPrefix(line, "# branch.head ")
			if val == "(detached)" {
				snap.IsDetached = true
			} else {
				snap.Branch = &val
			}
		} else if strings.HasPrefix(line, "# branch.upstream ") {
			val := strings.TrimPrefix(line, "# branch.upstream ")
			snap.UpstreamRef = &val
		} else if strings.HasPrefix(line, "# branch.ab ") {
			// Format: +<ahead> -<behind>
			val := strings.TrimPrefix(line, "# branch.ab ")
			parts := strings.Fields(val)
			if len(parts) == 2 {
				if n, err := strconv.Atoi(strings.TrimPrefix(parts[0], "+")); err == nil {
					snap.AheadCount = n
				}
				if n, err := strconv.Atoi(strings.TrimPrefix(parts[1], "-")); err == nil {
					snap.BehindCount = n
				}
			}
		} else if strings.HasPrefix(line, "# branch.oid ") {
			val := strings.TrimPrefix(line, "# branch.oid ")
			snap.HeadSHA = &val
		}
	}
}
