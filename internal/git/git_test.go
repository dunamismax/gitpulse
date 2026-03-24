package git

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/filter"
)

func TestParseNumstat(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		input      string
		wantAdd    int
		wantDel    int
		wantFiles  int
		wantPaths  int
		exclude    []string
	}{
		{
			name:      "basic two files",
			input:     "10\t5\tsrc/main.go\n3\t1\tsrc/lib.go\n",
			wantAdd:   13,
			wantDel:   6,
			wantFiles: 2,
			wantPaths: 2,
		},
		{
			name:      "binary file skipped",
			input:     "-\t-\timage.png\n4\t2\tREADME.md\n",
			wantAdd:   4,
			wantDel:   2,
			wantFiles: 1,
			wantPaths: 1,
		},
		{
			name:      "empty input",
			input:     "",
			wantAdd:   0,
			wantDel:   0,
			wantFiles: 0,
			wantPaths: 0,
		},
		{
			name:      "whitespace only",
			input:     "  \n  \n",
			wantAdd:   0,
			wantDel:   0,
			wantFiles: 0,
			wantPaths: 0,
		},
		{
			name:      "malformed line (missing tab)",
			input:     "10 5 src/main.go\n",
			wantAdd:   0,
			wantDel:   0,
			wantFiles: 0,
			wantPaths: 0,
		},
		{
			name:      "non-numeric additions",
			input:     "abc\t5\tsrc/main.go\n",
			wantAdd:   0,
			wantDel:   0,
			wantFiles: 0,
			wantPaths: 0,
		},
		{
			name:      "filter excludes node_modules",
			input:     "100\t50\tnode_modules/foo/bar.js\n10\t5\tsrc/main.go\n",
			wantAdd:   10,
			wantDel:   5,
			wantFiles: 1,
			wantPaths: 1,
			exclude:   []string{"node_modules/**"},
		},
		{
			name:      "single file no newline",
			input:     "7\t3\tindex.ts",
			wantAdd:   7,
			wantDel:   3,
			wantFiles: 1,
			wantPaths: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var f *filter.PathFilter
			if len(tt.exclude) > 0 {
				var err error
				f, err = filter.NewPathFilter(nil, tt.exclude)
				if err != nil {
					t.Fatalf("NewPathFilter: %v", err)
				}
			}

			stats, touched, err := parseNumstat(tt.input, f)
			if err != nil {
				t.Fatalf("parseNumstat error: %v", err)
			}
			if stats.Additions != tt.wantAdd {
				t.Errorf("additions = %d, want %d", stats.Additions, tt.wantAdd)
			}
			if stats.Deletions != tt.wantDel {
				t.Errorf("deletions = %d, want %d", stats.Deletions, tt.wantDel)
			}
			if stats.FileCount != tt.wantFiles {
				t.Errorf("file_count = %d, want %d", stats.FileCount, tt.wantFiles)
			}
			if len(touched) != tt.wantPaths {
				t.Errorf("touched paths = %d, want %d", len(touched), tt.wantPaths)
			}
		})
	}
}

func TestParseStatus(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		input      string
		wantBranch string
		wantDetach bool
		wantAhead  int
		wantBehind int
		wantSHA    string
	}{
		{
			name: "normal branch with upstream",
			input: "# branch.oid abc123def456\n" +
				"# branch.head main\n" +
				"# branch.upstream origin/main\n" +
				"# branch.ab +2 -1\n",
			wantBranch: "main",
			wantAhead:  2,
			wantBehind: 1,
			wantSHA:    "abc123def456",
		},
		{
			name: "detached HEAD",
			input: "# branch.oid abc123\n" +
				"# branch.head (detached)\n",
			wantDetach: true,
			wantSHA:    "abc123",
		},
		{
			name: "no upstream info",
			input: "# branch.oid 999\n" +
				"# branch.head feature-x\n",
			wantBranch: "feature-x",
			wantSHA:    "999",
		},
		{
			name:  "empty input",
			input: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			snap := &GitStatusSnapshot{}
			parseStatus(tt.input, snap)

			if tt.wantDetach && !snap.IsDetached {
				t.Error("expected detached HEAD")
			}
			if !tt.wantDetach && snap.IsDetached {
				t.Error("unexpected detached HEAD")
			}
			if tt.wantBranch != "" {
				if snap.Branch == nil || *snap.Branch != tt.wantBranch {
					t.Errorf("branch = %v, want %q", snap.Branch, tt.wantBranch)
				}
			}
			if snap.AheadCount != tt.wantAhead {
				t.Errorf("ahead = %d, want %d", snap.AheadCount, tt.wantAhead)
			}
			if snap.BehindCount != tt.wantBehind {
				t.Errorf("behind = %d, want %d", snap.BehindCount, tt.wantBehind)
			}
			if tt.wantSHA != "" {
				if snap.HeadSHA == nil || *snap.HeadSHA != tt.wantSHA {
					t.Errorf("head_sha = %v, want %q", snap.HeadSHA, tt.wantSHA)
				}
			}
		})
	}
}

func TestParseGitLog(t *testing.T) {
	t.Parallel()

	repoID := uuid.New()

	tests := []struct {
		name       string
		input      string
		emailSet   map[string]struct{}
		wantCount  int
		wantMerge  bool
		wantSHA    string
	}{
		{
			name: "single commit",
			input: "__COMMIT__\n" +
				"abc123\x1f2026-03-20T10:00:00Z\x1fAlice\x1falice@example.com\x1f\x1finitial\n" +
				"10\t5\tmain.go\n",
			wantCount: 1,
			wantSHA:   "abc123",
		},
		{
			name: "merge commit (two parents)",
			input: "__COMMIT__\n" +
				"def456\x1f2026-03-20T11:00:00Z\x1fBob\x1fbob@example.com\x1faaa bbb\x1fmerge PR #1\n",
			wantCount: 1,
			wantMerge: true,
			wantSHA:   "def456",
		},
		{
			name: "email filter excludes commit",
			input: "__COMMIT__\n" +
				"aaa\x1f2026-03-20T10:00:00Z\x1fAlice\x1falice@example.com\x1f\x1ffoo\n" +
				"__COMMIT__\n" +
				"bbb\x1f2026-03-20T11:00:00Z\x1fBob\x1fbob@other.com\x1f\x1fbar\n",
			emailSet:  map[string]struct{}{"alice@example.com": {}},
			wantCount: 1,
			wantSHA:   "aaa",
		},
		{
			name:      "empty input",
			input:     "",
			wantCount: 0,
		},
		{
			name: "multiple commits with numstat",
			input: "__COMMIT__\n" +
				"aaa\x1f2026-03-20T10:00:00Z\x1fAlice\x1fa@e.com\x1f\x1ffirst\n" +
				"5\t2\tfile1.go\n" +
				"__COMMIT__\n" +
				"bbb\x1f2026-03-21T10:00:00Z\x1fAlice\x1fa@e.com\x1f\x1fsecond\n" +
				"3\t1\tfile2.go\n" +
				"10\t0\tfile3.go\n",
			wantCount: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			commits, err := parseGitLog(tt.input, repoID, tt.emailSet, nil)
			if err != nil {
				t.Fatalf("parseGitLog error: %v", err)
			}
			if len(commits) != tt.wantCount {
				t.Fatalf("commit count = %d, want %d", len(commits), tt.wantCount)
			}
			if tt.wantSHA != "" && len(commits) > 0 {
				if commits[0].Commit.CommitSHA != tt.wantSHA {
					t.Errorf("sha = %q, want %q", commits[0].Commit.CommitSHA, tt.wantSHA)
				}
			}
			if tt.wantMerge && len(commits) > 0 {
				if !commits[0].Commit.IsMerge {
					t.Error("expected merge commit")
				}
			}
		})
	}
}

func TestDiscoverRepositories(t *testing.T) {
	if testing.Short() {
		t.Skip("requires git; skipping in short mode")
	}

	ctx := context.Background()
	root := t.TempDir()

	// Create two nested repos.
	repo1 := filepath.Join(root, "project-a")
	repo2 := filepath.Join(root, "sub", "project-b")
	for _, dir := range []string{repo1, repo2} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command("git", "init")
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git init %s: %v\n%s", dir, err, out)
		}
	}

	roots, err := DiscoverRepositories(ctx, root, 5)
	if err != nil {
		t.Fatalf("DiscoverRepositories: %v", err)
	}
	if len(roots) != 2 {
		t.Fatalf("found %d repos, want 2: %v", len(roots), roots)
	}
}

func TestImportHistory(t *testing.T) {
	if testing.Short() {
		t.Skip("requires git; skipping in short mode")
	}

	ctx := context.Background()
	dir := t.TempDir()

	gitCmd := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@example.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	gitCmd("init", "-b", "main")
	gitCmd("config", "user.email", "test@example.com")
	gitCmd("config", "user.name", "Test")

	// Make 3 commits.
	for i := 1; i <= 3; i++ {
		fpath := filepath.Join(dir, fmt.Sprintf("file%d.go", i))
		content := fmt.Sprintf("package main\n// file %d\n", i)
		if err := os.WriteFile(fpath, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		gitCmd("add", fmt.Sprintf("file%d.go", i))

		date := time.Now().UTC().AddDate(0, 0, -i).Format(time.RFC3339)
		cmd := exec.Command("git", "commit", "-m", fmt.Sprintf("commit %d", i), "--date", date)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test",
			"GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test",
			"GIT_COMMITTER_EMAIL=test@example.com",
			fmt.Sprintf("GIT_AUTHOR_DATE=%s", date),
			fmt.Sprintf("GIT_COMMITTER_DATE=%s", date),
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("commit: %v\n%s", err, out)
		}
	}

	repoID := uuid.New()
	commits, err := ImportHistory(ctx, repoID, dir, nil, 30, nil)
	if err != nil {
		t.Fatalf("ImportHistory: %v", err)
	}
	if len(commits) != 3 {
		t.Fatalf("imported %d commits, want 3", len(commits))
	}

	// Verify each commit has the right repoID.
	for _, c := range commits {
		if c.Commit.RepoID != repoID {
			t.Errorf("commit repo_id = %v, want %v", c.Commit.RepoID, repoID)
		}
		if c.Commit.CommitSHA == "" {
			t.Error("commit SHA is empty")
		}
	}

	// Filter by email — should get all (test@example.com matches).
	filtered, err := ImportHistory(ctx, repoID, dir, []string{"test@example.com"}, 30, nil)
	if err != nil {
		t.Fatalf("ImportHistory with filter: %v", err)
	}
	if len(filtered) != 3 {
		t.Fatalf("filtered import = %d, want 3", len(filtered))
	}

	// Filter by different email — should get 0.
	filtered2, err := ImportHistory(ctx, repoID, dir, []string{"other@example.com"}, 30, nil)
	if err != nil {
		t.Fatalf("ImportHistory with other filter: %v", err)
	}
	if len(filtered2) != 0 {
		t.Fatalf("filtered import = %d, want 0", len(filtered2))
	}
}
