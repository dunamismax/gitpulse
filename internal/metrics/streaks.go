// Package metrics implements streak calculation, scoring, and achievement logic.
package metrics

import (
	"sort"
	"time"

	"github.com/dunamismax/gitpulse/internal/models"
)

// QualifiesAsActiveDay returns true if the rollup represents a qualifying
// productive day for streak purposes.
//
// A day qualifies if it has at least one commit, or 100+ live line changes,
// or 25+ focus minutes.
func QualifiesAsActiveDay(r models.DailyRollup) bool {
	return r.Commits > 0 ||
		(r.LiveAdditions+r.LiveDeletions) >= 100 ||
		r.FocusMinutes >= 25
}

// ComputeStreaks calculates current and best streaks from a slice of daily rollups.
// The rollups need not be pre-sorted; this function sorts them internally.
func ComputeStreaks(days []models.DailyRollup) models.StreakSummary {
	return ComputeStreaksAsOf(days, time.Now().UTC())
}

// ComputeStreaksAsOf calculates streaks as if "today" is asOf.
func ComputeStreaksAsOf(days []models.DailyRollup, asOf time.Time) models.StreakSummary {
	// Build a set of qualifying day strings.
	qualifying := map[string]bool{}
	for _, r := range days {
		if QualifiesAsActiveDay(r) {
			qualifying[r.Day] = true
		}
	}

	// Collect all unique qualifying days and sort descending.
	var qualDays []string
	for d := range qualifying {
		qualDays = append(qualDays, d)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(qualDays)))

	if len(qualDays) == 0 {
		return models.StreakSummary{}
	}

	today := asOf.Format("2006-01-02")
	yesterday := asOf.AddDate(0, 0, -1).Format("2006-01-02")

	// Current streak: count consecutive days ending on today or yesterday.
	var currentDays int
	if qualifying[today] || qualifying[yesterday] {
		cursor := asOf
		if !qualifying[today] {
			cursor = asOf.AddDate(0, 0, -1)
		}
		for {
			d := cursor.Format("2006-01-02")
			if !qualifying[d] {
				break
			}
			currentDays++
			cursor = cursor.AddDate(0, 0, -1)
		}
	}

	// Best streak: scan entire history.
	bestDays := 0
	run := 0
	var prevDay string
	for _, d := range qualDays {
		if prevDay == "" {
			run = 1
		} else {
			// Check if this day is exactly 1 day before prevDay.
			prev, _ := time.Parse("2006-01-02", prevDay)
			curr, _ := time.Parse("2006-01-02", d)
			if prev.Sub(curr) == 24*time.Hour {
				run++
			} else {
				run = 1
			}
		}
		if run > bestDays {
			bestDays = run
		}
		prevDay = d
	}

	return models.StreakSummary{
		CurrentDays: currentDays,
		BestDays:    bestDays,
	}
}
