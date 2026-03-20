use serde::{Deserialize, Serialize};

use crate::models::DailyRollup;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScoreFormula {
    pub live_line_unit: i64,
    pub commit_bonus: i64,
    pub push_bonus: i64,
    pub focus_minute_unit: i64,
}

impl Default for ScoreFormula {
    fn default() -> Self {
        Self { live_line_unit: 20, commit_bonus: 50, push_bonus: 80, focus_minute_unit: 2 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DailyScoreBreakdown {
    pub live_points: i64,
    pub commit_points: i64,
    pub push_points: i64,
    pub focus_points: i64,
    pub total: i64,
}

impl ScoreFormula {
    pub fn score(&self, rollup: &DailyRollup) -> DailyScoreBreakdown {
        let live_points =
            ((rollup.live_additions + rollup.live_deletions) / self.live_line_unit).max(0);
        let commit_points = rollup.commits * self.commit_bonus;
        let push_points = rollup.pushes * self.push_bonus;
        let focus_points = rollup.focus_minutes * self.focus_minute_unit;
        DailyScoreBreakdown {
            live_points,
            commit_points,
            push_points,
            focus_points,
            total: live_points + commit_points + push_points + focus_points,
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::ScoreFormula;
    use crate::models::DailyRollup;

    #[test]
    fn scoring_keeps_raw_stats_and_points_separate() {
        let formula = ScoreFormula::default();
        let rollup = DailyRollup {
            repo_id: None,
            day: NaiveDate::from_ymd_opt(2026, 3, 20).unwrap(),
            live_additions: 120,
            live_deletions: 40,
            staged_additions: 0,
            staged_deletions: 0,
            committed_additions: 0,
            committed_deletions: 0,
            commits: 2,
            pushes: 1,
            focus_minutes: 30,
            files_touched: 0,
            languages_touched: 0,
            score: 0,
        };
        let breakdown = formula.score(&rollup);
        assert_eq!(breakdown.live_points, 8);
        assert_eq!(breakdown.commit_points, 100);
        assert_eq!(breakdown.push_points, 80);
        assert_eq!(breakdown.focus_points, 60);
        assert_eq!(breakdown.total, 248);
    }
}
