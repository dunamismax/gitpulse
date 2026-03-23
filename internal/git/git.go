// Package git runs git subprocesses and parses their output.
package git

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/filter"
	"github.com/dunamismax/gitpulse/internal/models"
)

// run executes a git command in the given directory and returns stdout.
func run(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w (stderr: %s)", strings.Join(args, " "), err, stderr.String())
	}
	return stdout.String(), nil
}

// ResolveRepoRoot returns the absolute root of the git repository containing path.
func ResolveRepoRoot(ctx context.Context, path string) (string, error) {
	out, err := run(ctx, path, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

// ProbeRepository reads basic metadata from a git repository.
func ProbeRepository(ctx context.Context, repoRoot string) (name, remoteURL, defaultBranch string, err error) {
	name = filepath.Base(repoRoot)

	// Try to get remote URL.
	if url, e := run(ctx, repoRoot, "remote", "get-url", "origin"); e == nil {
		remoteURL = strings.TrimSpace(url)
	}

	// Get current branch or HEAD ref.
	if ref, e := run(ctx, repoRoot, "symbolic-ref", "--short", "HEAD"); e == nil {
		defaultBranch = strings.TrimSpace(ref)
	}

	return name, remoteURL, defaultBranch, nil
}

// DiscoverRepositories walks root up to maxDepth looking for .git directories.
// It returns the absolute path of each repository root found.
func DiscoverRepositories(ctx context.Context, root string, maxDepth int) ([]string, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	var roots []string
	if err := walkGit(ctx, abs, 0, maxDepth, &roots); err != nil {
		return nil, err
	}
	return roots, nil
}

func walkGit(ctx context.Context, dir string, depth, maxDepth int, out *[]string) error {
	if depth > maxDepth {
		return nil
	}

	gitDir := filepath.Join(dir, ".git")
	if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
		*out = append(*out, dir)
		return nil // Don't recurse into nested git repos.
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil // Skip unreadable dirs.
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if strings.HasPrefix(e.Name(), ".") {
			continue // Skip hidden dirs.
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		walkGit(ctx, filepath.Join(dir, e.Name()), depth+1, maxDepth, out) //nolint:errcheck
	}
	return nil
}

// parseNumstat parses lines from `git diff --numstat` output.
// Binary files produce "-\t-\tpath" and are skipped.
func parseNumstat(output string, f *filter.PathFilter) (models.DiffStats, []TouchedPath, error) {
	var stats models.DiffStats
	var touched []TouchedPath

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		addStr, delStr, path := parts[0], parts[1], parts[2]
		if addStr == "-" || delStr == "-" {
			continue // Binary file.
		}
		if f != nil && !f.Allows(path) {
			continue
		}
		add, err1 := strconv.Atoi(addStr)
		del, err2 := strconv.Atoi(delStr)
		if err1 != nil || err2 != nil {
			continue
		}
		stats.Additions += add
		stats.Deletions += del
		stats.FileCount++
		touched = append(touched, TouchedPath{Path: path, Additions: add, Deletions: del})
	}
	return stats, touched, nil
}

// countTextLines counts newlines in a text file. Returns 0 for files >= 1 MB
// or files that appear to be binary.
func countTextLines(path string) int {
	const maxSize = 1 << 20 // 1 MB
	info, err := os.Stat(path)
	if err != nil || info.Size() > maxSize {
		return 0
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	if !isTextContent(data) {
		return 0
	}
	return bytes.Count(data, []byte("\n"))
}

// isTextContent returns true if the content looks like text (no null bytes in
// the first 512 bytes).
func isTextContent(data []byte) bool {
	sample := data
	if len(sample) > 512 {
		sample = sample[:512]
	}
	return !bytes.ContainsRune(sample, 0)
}

// GitVersion returns the installed git version string for diagnostics.
func GitVersion(ctx context.Context) (string, error) {
	out, err := run(ctx, ".", "version")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

// TouchedPath records per-file line change counts.
type TouchedPath struct {
	Path      string
	Additions int
	Deletions int
}

// ImportedCommit pairs a parsed commit event with its file-level changes.
type ImportedCommit struct {
	Commit       models.CommitEvent
	TouchedPaths []TouchedPath
}

// ImportHistory runs `git log` and returns commits authored within the last
// `days` days. Only commits whose author email is in authorEmails are included
// (empty slice means include all). The filter is applied to touched paths.
func ImportHistory(
	ctx context.Context,
	repoID uuid.UUID,
	repoRoot string,
	authorEmails []string,
	days int,
	f *filter.PathFilter,
) ([]ImportedCommit, error) {
	since := time.Now().UTC().AddDate(0, 0, -days).Format("2006-01-02")
	emailSet := make(map[string]struct{}, len(authorEmails))
	for _, e := range authorEmails {
		emailSet[strings.ToLower(e)] = struct{}{}
	}

	out, err := run(ctx, repoRoot,
		"log", "--all",
		"--date=iso-strict",
		"--since="+since,
		"--numstat",
		"--pretty=format:__COMMIT__%n%H\x1f%aI\x1f%an\x1f%ae\x1f%P\x1f%s",
	)
	if err != nil {
		return nil, err
	}

	return parseGitLog(out, repoID, emailSet, f)
}

func parseGitLog(output string, repoID uuid.UUID, emailSet map[string]struct{}, f *filter.PathFilter) ([]ImportedCommit, error) {
	now := time.Now().UTC()
	var commits []ImportedCommit

	// Split on the sentinel line __COMMIT__.
	blocks := strings.Split(output, "__COMMIT__\n")
	for _, block := range blocks {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}

		lines := strings.SplitN(block, "\n", 2)
		if len(lines) == 0 {
			continue
		}
		header := lines[0]
		rest := ""
		if len(lines) > 1 {
			rest = lines[1]
		}

		// Parse the \x1f-delimited header fields.
		fields := strings.Split(header, "\x1f")
		if len(fields) < 6 {
			continue
		}
		sha := strings.TrimSpace(fields[0])
		dateStr := strings.TrimSpace(fields[1])
		authorName := strings.TrimSpace(fields[2])
		authorEmail := strings.TrimSpace(fields[3])
		parents := strings.TrimSpace(fields[4])
		summary := strings.TrimSpace(fields[5])

		if sha == "" {
			continue
		}

		// Author email filter.
		if len(emailSet) > 0 {
			if _, ok := emailSet[strings.ToLower(authorEmail)]; !ok {
				continue
			}
		}

		authoredAt, err := time.Parse(time.RFC3339, dateStr)
		if err != nil {
			// Try alternate ISO format with space separator.
			authoredAt, err = time.Parse("2006-01-02 15:04:05 -0700", dateStr)
			if err != nil {
				authoredAt = now
			}
		}

		isMerge := strings.Contains(strings.TrimSpace(parents), " ")

		// Parse numstat lines (the `rest` after the header).
		var addTotal, delTotal, fileCount int
		var touched []TouchedPath
		for _, line := range strings.Split(rest, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "\t", 3)
			if len(parts) != 3 {
				continue
			}
			addStr, delStr, path := parts[0], parts[1], parts[2]
			if addStr == "-" || delStr == "-" {
				continue
			}
			add, err1 := strconv.Atoi(addStr)
			del, err2 := strconv.Atoi(delStr)
			if err1 != nil || err2 != nil {
				continue
			}
			if f != nil && !f.Allows(path) {
				continue
			}
			addTotal += add
			delTotal += del
			fileCount++
			touched = append(touched, TouchedPath{Path: path, Additions: add, Deletions: del})
		}

		var namePtr *string
		if authorName != "" {
			namePtr = &authorName
		}
		var emailPtr *string
		if authorEmail != "" {
			emailPtr = &authorEmail
		}

		c := models.CommitEvent{
			ID:           uuid.New(),
			RepoID:       repoID,
			CommitSHA:    sha,
			AuthoredAt:   authoredAt,
			AuthorName:   namePtr,
			AuthorEmail:  emailPtr,
			Summary:      summary,
			Additions:    addTotal,
			Deletions:    delTotal,
			FilesChanged: fileCount,
			IsMerge:      isMerge,
			ImportedAt:   now,
		}

		commits = append(commits, ImportedCommit{Commit: c, TouchedPaths: touched})
	}
	return commits, nil
}
