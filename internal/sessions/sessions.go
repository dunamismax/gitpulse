// Package sessions implements the focus session detection algorithm.
package sessions

import (
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/dunamismax/gitpulse/internal/models"
)

// Sessionize groups activity points into focus sessions by time gap.
//
// Two consecutive events belong to the same session if the time between them
// is less than or equal to gapMinutes. When a larger gap is found, the current
// session is finalized and a new one begins.
//
// Each session's ActiveMinutes is max(1, duration_minutes) so single-event
// sessions are never zero-length.
func Sessionize(events []models.ActivityPoint, gapMinutes int64) []models.FocusSession {
	if len(events) == 0 {
		return nil
	}

	// Sort by time ascending.
	sorted := make([]models.ActivityPoint, len(events))
	copy(sorted, events)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].ObservedAt.Before(sorted[j].ObservedAt)
	})

	var sessions []models.FocusSession
	gap := time.Duration(gapMinutes) * time.Minute

	// Window state.
	winStart := sorted[0].ObservedAt
	winEnd := sorted[0].ObservedAt
	repoSet := map[uuid.UUID]struct{}{sorted[0].RepoID: {}}
	eventCount := 1
	changedLines := sorted[0].ChangedLines

	flush := func() {
		activeMinutes := int(winEnd.Sub(winStart).Minutes())
		if activeMinutes < 1 {
			activeMinutes = 1
		}
		repoIDs := make([]uuid.UUID, 0, len(repoSet))
		for id := range repoSet {
			repoIDs = append(repoIDs, id)
		}
		sessions = append(sessions, models.FocusSession{
			ID:                uuid.New(),
			StartedAt:         winStart,
			EndedAt:           winEnd,
			ActiveMinutes:     activeMinutes,
			RepoIDs:           repoIDs,
			EventCount:        eventCount,
			TotalChangedLines: changedLines,
		})
	}

	for _, pt := range sorted[1:] {
		if pt.ObservedAt.Sub(winEnd) > gap {
			flush()
			// Start new window.
			winStart = pt.ObservedAt
			winEnd = pt.ObservedAt
			repoSet = map[uuid.UUID]struct{}{pt.RepoID: {}}
			eventCount = 1
			changedLines = pt.ChangedLines
		} else {
			winEnd = pt.ObservedAt
			repoSet[pt.RepoID] = struct{}{}
			eventCount++
			changedLines += pt.ChangedLines
		}
	}
	flush()

	return sessions
}
