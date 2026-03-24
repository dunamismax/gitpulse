package db

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

func TestSQLiteBootstrapAndRepositoryRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "gitpulse.db")

	handle, err := Connect(ctx, path)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	t.Cleanup(func() {
		if err := handle.Close(); err != nil {
			t.Fatalf("Close() error = %v", err)
		}
	})

	if err := RunMigrations(ctx, handle); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	targetID := uuid.New()
	now := time.Now().UTC().Truncate(time.Second)
	if err := UpsertTrackedTarget(ctx, handle, models.TrackedTarget{
		ID:        targetID,
		Path:      "/tmp/workspace",
		Kind:      "folder",
		CreatedAt: now,
	}); err != nil {
		t.Fatalf("UpsertTrackedTarget() error = %v", err)
	}

	repoID := uuid.New()
	remoteURL := "git@github.com:dunamismax/gitpulse.git"
	defaultBranch := "main"
	if err := UpsertRepository(ctx, handle, models.Repository{
		ID:              repoID,
		TargetID:        &targetID,
		Name:            "gitpulse",
		RootPath:        "/tmp/workspace/gitpulse",
		RemoteURL:       &remoteURL,
		DefaultBranch:   &defaultBranch,
		IncludePatterns: []string{"cmd/**"},
		ExcludePatterns: []string{".git/**", "dist/**"},
		IsMonitored:     true,
		State:           models.StateActive,
		CreatedAt:       now,
		UpdatedAt:       now,
	}); err != nil {
		t.Fatalf("UpsertRepository() error = %v", err)
	}

	repos, err := ListRepositories(ctx, handle)
	if err != nil {
		t.Fatalf("ListRepositories() error = %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("ListRepositories() len = %d, want 1", len(repos))
	}
	if repos[0].ID != repoID {
		t.Fatalf("repository id = %s, want %s", repos[0].ID, repoID)
	}
	if repos[0].TargetID == nil || *repos[0].TargetID != targetID {
		t.Fatalf("repository target_id = %v, want %s", repos[0].TargetID, targetID)
	}
	if got := repos[0].IncludePatterns; len(got) != 1 || got[0] != "cmd/**" {
		t.Fatalf("include patterns = %#v", got)
	}
	if got := repos[0].ExcludePatterns; len(got) != 2 || got[0] != ".git/**" || got[1] != "dist/**" {
		t.Fatalf("exclude patterns = %#v", got)
	}
}
