use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::models::{DailyRollup, FocusSession};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum AchievementKind {
    FirstRepo,
    FirstCommitTracked,
    FirstPushDetected,
    Lines100,
    Lines1000,
    Commits5,
    Refactorer,
    Focus50,
    Polyglot,
}

impl AchievementKind {
    pub fn title(self) -> &'static str {
        match self {
            Self::FirstRepo => "First Repo",
            Self::FirstCommitTracked => "First Commit Tracked",
            Self::FirstPushDetected => "First Push Detected",
            Self::Lines100 => "100 Lines in a Day",
            Self::Lines1000 => "1000 Lines in a Day",
            Self::Commits5 => "5 Commits in a Day",
            Self::Refactorer => "Refactorer",
            Self::Focus50 => "Focus 50",
            Self::Polyglot => "Polyglot",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AchievementAward {
    pub kind: AchievementKind,
    pub day: Option<NaiveDate>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct StreakSummary {
    pub current_days: i64,
    pub best_days: i64,
}

pub fn compute_streaks(days: &[DailyRollup]) -> StreakSummary {
    if days.is_empty() {
        return StreakSummary::default();
    }

    let mut ordered = days.to_vec();
    ordered.sort_by_key(|entry| entry.day);
    let qualifying: Vec<_> = ordered
        .iter()
        .filter(|entry| {
            entry.commits > 0
                || entry.live_additions + entry.live_deletions >= 100
                || entry.focus_minutes >= 25
        })
        .map(|entry| entry.day)
        .collect();

    if qualifying.is_empty() {
        return StreakSummary::default();
    }

    let mut current = 1_i64;
    let mut best = 1_i64;
    for window in qualifying.windows(2) {
        if let [left, right] = window {
            if (*right - *left).num_days() == 1 {
                current += 1;
                best = best.max(current);
            } else {
                current = 1;
            }
        }
    }

    let mut tail = 1_i64;
    for window in qualifying.windows(2).rev() {
        if let [left, right] = window {
            if (*right - *left).num_days() == 1 {
                tail += 1;
            } else {
                break;
            }
        }
    }

    StreakSummary { current_days: tail, best_days: best.max(tail) }
}

pub fn evaluate_achievements(
    repo_count: usize,
    push_count: usize,
    rollups: &[DailyRollup],
    sessions: &[FocusSession],
) -> Vec<AchievementAward> {
    let mut awards = Vec::new();

    if repo_count > 0 {
        awards.push(AchievementAward {
            kind: AchievementKind::FirstRepo,
            day: rollups.first().map(|entry| entry.day),
            reason: "Started tracking your first repository.".into(),
        });
    }
    if rollups.iter().any(|entry| entry.commits > 0) {
        awards.push(AchievementAward {
            kind: AchievementKind::FirstCommitTracked,
            day: rollups.iter().find(|entry| entry.commits > 0).map(|entry| entry.day),
            reason: "Imported or observed your first qualifying commit.".into(),
        });
    }
    if push_count > 0 {
        awards.push(AchievementAward {
            kind: AchievementKind::FirstPushDetected,
            day: rollups.iter().find(|entry| entry.pushes > 0).map(|entry| entry.day),
            reason: "Detected a push reaching upstream.".into(),
        });
    }

    for rollup in rollups {
        let live_total = rollup.live_additions + rollup.live_deletions;
        if live_total >= 100 {
            awards.push(AchievementAward {
                kind: AchievementKind::Lines100,
                day: Some(rollup.day),
                reason: "Changed at least 100 live lines in a single day.".into(),
            });
        }
        if live_total >= 1_000 {
            awards.push(AchievementAward {
                kind: AchievementKind::Lines1000,
                day: Some(rollup.day),
                reason: "Changed at least 1000 live lines in a single day.".into(),
            });
        }
        if rollup.commits >= 5 {
            awards.push(AchievementAward {
                kind: AchievementKind::Commits5,
                day: Some(rollup.day),
                reason: "Made 5 qualifying commits in one day.".into(),
            });
        }
        if rollup.committed_additions < rollup.committed_deletions
            && rollup.committed_additions + rollup.committed_deletions >= 200
        {
            awards.push(AchievementAward {
                kind: AchievementKind::Refactorer,
                day: Some(rollup.day),
                reason: "High change volume with a net negative diff.".into(),
            });
        }
        if rollup.languages_touched >= 3 {
            awards.push(AchievementAward {
                kind: AchievementKind::Polyglot,
                day: Some(rollup.day),
                reason: "Touched 3 or more languages in one day.".into(),
            });
        }
    }

    for session in sessions {
        if session.active_minutes >= 50 {
            awards.push(AchievementAward {
                kind: AchievementKind::Focus50,
                day: Some(session.started_at_utc.date_naive()),
                reason: "Stayed in a single focus session for 50+ minutes.".into(),
            });
        }
    }

    awards.sort_by_key(|award| (award.kind, award.day));
    awards.dedup_by_key(|award| award.kind);
    awards
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, NaiveDate, Utc};
    use uuid::Uuid;

    use super::{AchievementKind, compute_streaks, evaluate_achievements};
    use crate::models::{DailyRollup, FocusSession};

    fn rollup(day: NaiveDate, commits: i64, live: i64, focus: i64) -> DailyRollup {
        DailyRollup {
            repo_id: None,
            day,
            live_additions: live,
            live_deletions: 0,
            staged_additions: 0,
            staged_deletions: 0,
            committed_additions: live,
            committed_deletions: 0,
            commits,
            pushes: 0,
            focus_minutes: focus,
            files_touched: 0,
            languages_touched: 0,
            score: 0,
        }
    }

    #[test]
    fn streaks_use_qualifying_days() {
        let base = NaiveDate::from_ymd_opt(2026, 3, 18).unwrap();
        let streak = compute_streaks(&[
            rollup(base, 1, 0, 0),
            rollup(base + Duration::days(1), 0, 101, 0),
            rollup(base + Duration::days(2), 0, 0, 30),
        ]);
        assert_eq!(streak.current_days, 3);
        assert_eq!(streak.best_days, 3);
    }

    #[test]
    fn achievements_cover_core_badges() {
        let day = NaiveDate::from_ymd_opt(2026, 3, 20).unwrap();
        let awards = evaluate_achievements(
            1,
            1,
            &[DailyRollup {
                repo_id: None,
                day,
                live_additions: 1_000,
                live_deletions: 0,
                staged_additions: 0,
                staged_deletions: 0,
                committed_additions: 50,
                committed_deletions: 300,
                commits: 5,
                pushes: 1,
                focus_minutes: 10,
                files_touched: 0,
                languages_touched: 3,
                score: 0,
            }],
            &[FocusSession {
                id: Uuid::new_v4(),
                started_at_utc: Utc::now(),
                ended_at_utc: Utc::now(),
                active_minutes: 60,
                repo_ids: vec![Uuid::new_v4()],
                event_count: 2,
                total_changed_lines: 100,
            }],
        );
        assert!(awards.iter().any(|award| award.kind == AchievementKind::FirstRepo));
        assert!(awards.iter().any(|award| award.kind == AchievementKind::FirstPushDetected));
        assert!(awards.iter().any(|award| award.kind == AchievementKind::Focus50));
        assert!(awards.iter().any(|award| award.kind == AchievementKind::Refactorer));
    }

    #[test]
    fn achievements_dedup_duplicate_kinds_across_multiple_days() {
        let base = NaiveDate::from_ymd_opt(2026, 3, 20).unwrap();
        let awards = evaluate_achievements(
            1,
            0,
            &[rollup(base, 0, 150, 0), rollup(base + Duration::days(1), 0, 200, 0)],
            &[],
        );
        assert_eq!(
            awards.iter().filter(|award| award.kind == AchievementKind::Lines100).count(),
            1
        );
        assert_eq!(
            awards.iter().find(|award| award.kind == AchievementKind::Lines100).unwrap().day,
            Some(base)
        );
    }
}
