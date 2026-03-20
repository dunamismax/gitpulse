use std::collections::BTreeSet;

use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use crate::models::{ActivityPoint, FocusSession};

pub fn sessionize(events: &[ActivityPoint], gap_minutes: i64) -> Vec<FocusSession> {
    if events.is_empty() {
        return Vec::new();
    }

    let mut ordered = events.to_vec();
    ordered.sort_by_key(|point| point.observed_at_utc);

    let gap = Duration::minutes(gap_minutes.max(1));
    let mut sessions = Vec::new();
    let mut current_start = ordered[0].observed_at_utc;
    let mut current_end = ordered[0].observed_at_utc;
    let mut repo_ids = BTreeSet::from([ordered[0].repo_id]);
    let mut changed_lines = ordered[0].changed_lines;
    let mut event_count = 1_i64;

    for event in ordered.into_iter().skip(1) {
        if event.observed_at_utc - current_end > gap {
            sessions.push(build_session(
                current_start,
                current_end,
                &repo_ids,
                event_count,
                changed_lines,
            ));
            current_start = event.observed_at_utc;
            current_end = event.observed_at_utc;
            repo_ids = BTreeSet::from([event.repo_id]);
            changed_lines = event.changed_lines;
            event_count = 1;
            continue;
        }

        current_end = event.observed_at_utc;
        repo_ids.insert(event.repo_id);
        changed_lines += event.changed_lines;
        event_count += 1;
    }

    sessions.push(build_session(current_start, current_end, &repo_ids, event_count, changed_lines));

    sessions
}

fn build_session(
    started_at_utc: DateTime<Utc>,
    ended_at_utc: DateTime<Utc>,
    repo_ids: &BTreeSet<Uuid>,
    event_count: i64,
    total_changed_lines: i64,
) -> FocusSession {
    let raw_minutes = (ended_at_utc - started_at_utc).num_minutes();
    FocusSession {
        id: Uuid::new_v4(),
        started_at_utc,
        ended_at_utc,
        active_minutes: raw_minutes.max(1),
        repo_ids: repo_ids.iter().copied().collect(),
        event_count,
        total_changed_lines,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use uuid::Uuid;

    use super::sessionize;
    use crate::models::{ActivityKind, ActivityPoint};

    #[test]
    fn sessionization_splits_on_inactivity_gap() {
        let repo = Uuid::new_v4();
        let start = Utc::now();
        let sessions = sessionize(
            &[
                ActivityPoint {
                    repo_id: repo,
                    observed_at_utc: start,
                    kind: ActivityKind::Refresh,
                    changed_lines: 10,
                },
                ActivityPoint {
                    repo_id: repo,
                    observed_at_utc: start + Duration::minutes(5),
                    kind: ActivityKind::Commit,
                    changed_lines: 20,
                },
                ActivityPoint {
                    repo_id: repo,
                    observed_at_utc: start + Duration::minutes(25),
                    kind: ActivityKind::Push,
                    changed_lines: 30,
                },
            ],
            15,
        );
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].active_minutes, 5);
        assert_eq!(sessions[1].active_minutes, 1);
    }
}
