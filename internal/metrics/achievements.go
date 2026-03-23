package metrics

import (
	"time"

	"github.com/dunamismax/gitpulse/internal/models"
)

// EvaluateAchievements inspects rollups and sessions and returns the full set
// of earned achievements. Each kind is deduplicated - only the earliest
// occurrence is returned.
func EvaluateAchievements(
	repoCount int,
	totalPushes int,
	rollups []models.DailyRollup,
	sessions []models.FocusSession,
) []models.Achievement {
	now := time.Now().UTC()
	// Map from kind to achievement to deduplicate.
	earned := map[models.AchievementKind]models.Achievement{}

	maybeAdd := func(kind models.AchievementKind, day *string, reason string) {
		if _, already := earned[kind]; !already {
			earned[kind] = models.Achievement{
				Kind:       kind,
				UnlockedAt: now,
				Day:        day,
				Reason:     reason,
			}
		}
	}

	if repoCount >= 1 {
		maybeAdd(models.AchFirstRepo, nil, "First repository added")
	}

	for _, r := range rollups {
		day := r.Day

		if r.Commits > 0 {
			maybeAdd(models.AchFirstCommitTracked, &day, "First commit tracked")
		}

		liveLines := r.LiveAdditions + r.LiveDeletions
		if liveLines >= 100 {
			maybeAdd(models.AchLines100, &day, "100+ live line changes in a day")
		}
		if liveLines >= 1000 {
			maybeAdd(models.AchLines1000, &day, "1000+ live line changes in a day")
		}

		if r.Commits >= 5 {
			maybeAdd(models.AchCommits5, &day, "5+ commits in a day")
		}

		committed := r.CommittedAdditions + r.CommittedDeletions
		if r.CommittedDeletions > r.CommittedAdditions && committed >= 200 {
			maybeAdd(models.AchRefactorer, &day, "Major refactor: more deletions than additions")
		}

		if r.LanguagesTouched >= 3 {
			maybeAdd(models.AchPolyglot, &day, "3+ languages touched in a day")
		}
	}

	if totalPushes > 0 {
		maybeAdd(models.AchFirstPushDetected, nil, "First push detected")
	}

	for _, s := range sessions {
		if s.ActiveMinutes >= 50 {
			maybeAdd(models.AchFocus50, nil, "50+ minute focus session")
			break
		}
	}

	// Collect and return in a stable order.
	order := []models.AchievementKind{
		models.AchFirstRepo,
		models.AchFirstCommitTracked,
		models.AchFirstPushDetected,
		models.AchLines100,
		models.AchLines1000,
		models.AchCommits5,
		models.AchRefactorer,
		models.AchPolyglot,
		models.AchFocus50,
	}

	var result []models.Achievement
	for _, k := range order {
		if a, ok := earned[k]; ok {
			result = append(result, a)
		}
	}
	return result
}
