package metrics

import "github.com/dunamismax/gitpulse/internal/models"

// ScoreFormula holds the coefficients used to compute a daily score.
type ScoreFormula struct {
	// LiveLineUnit: one score point per this many changed lines.
	LiveLineUnit int
	// CommitBonus: score points awarded per commit.
	CommitBonus int
	// PushBonus: score points awarded per push.
	PushBonus int
	// FocusMinuteUnit: score points awarded per focus minute.
	FocusMinuteUnit int
}

// DefaultScoreFormula returns the standard scoring coefficients.
func DefaultScoreFormula() ScoreFormula {
	return ScoreFormula{
		LiveLineUnit:    20,
		CommitBonus:     50,
		PushBonus:       80,
		FocusMinuteUnit: 2,
	}
}

// ComputeScore calculates the score for a daily rollup.
//
// Formula:
//
//	(live_additions + live_deletions) / LiveLineUnit
//	+ commits * CommitBonus
//	+ pushes  * PushBonus
//	+ focus_minutes * FocusMinuteUnit
func ComputeScore(r models.DailyRollup, f ScoreFormula) int {
	lineScore := 0
	if f.LiveLineUnit > 0 {
		lineScore = (r.LiveAdditions + r.LiveDeletions) / f.LiveLineUnit
	}
	return lineScore +
		r.Commits*f.CommitBonus +
		r.Pushes*f.PushBonus +
		r.FocusMinutes*f.FocusMinuteUnit
}
