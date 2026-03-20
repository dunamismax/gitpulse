use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;

pub fn timezone_from_name(name: &str) -> Tz {
    name.parse().unwrap_or(chrono_tz::UTC)
}

pub fn rollup_day(
    timestamp: DateTime<Utc>,
    timezone: &str,
    day_boundary_minutes: i32,
) -> NaiveDate {
    let tz = timezone_from_name(timezone);
    let shifted = timestamp - Duration::minutes(i64::from(day_boundary_minutes));
    shifted.with_timezone(&tz).date_naive()
}

pub fn format_local(timestamp: DateTime<Utc>, timezone: &str) -> String {
    let tz = timezone_from_name(timezone);
    timestamp.with_timezone(&tz).format("%Y-%m-%d %H:%M").to_string()
}

pub fn start_of_day_utc(
    day: NaiveDate,
    timezone: &str,
    day_boundary_minutes: i32,
) -> DateTime<Utc> {
    let tz = timezone_from_name(timezone);
    let midnight = day.and_hms_opt(0, 0, 0).unwrap();
    let local = tz
        .from_local_datetime(&midnight)
        .earliest()
        .unwrap_or_else(|| tz.from_utc_datetime(&midnight));
    (local + Duration::minutes(i64::from(day_boundary_minutes))).with_timezone(&Utc)
}
