/**
 * Date utilities that respect the app's timezone (US/Pacific) rather than
 * the server's UTC.
 *
 * Why: Vercel servers run in UTC. If a PT student practices at 9pm PT,
 * that's already the next day in UTC, so naïve date comparisons think
 * they practiced "tomorrow" and a day later would see a false gap that
 * breaks the streak. Every streak-date comparison must happen in the
 * student's local timezone.
 *
 * For now the app is PT-only. If multi-timezone support is ever needed,
 * replace APP_TIMEZONE with a per-student column.
 */
export const APP_TIMEZONE = "America/Los_Angeles";

/**
 * Return today's date as YYYY-MM-DD in the app timezone.
 * Example: at 2026-04-08T04:00:00Z (UTC) this returns "2026-04-07"
 * because 4am UTC is 9pm previous-day PT.
 */
export function todayInAppTimezone(now: Date = new Date()): string {
  return dateInAppTimezone(now);
}

/** Return the given Date as YYYY-MM-DD in the app timezone. */
export function dateInAppTimezone(d: Date): string {
  // en-CA locale outputs YYYY-MM-DD, avoiding manual padding.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Return yesterday's date (relative to `todayStr`) as YYYY-MM-DD. */
export function yesterdayOf(todayStr: string): string {
  // Parse as UTC midnight, subtract a day, format. Safe because we only
  // care about the date string — no timezone math needed once we're in
  // YYYY-MM-DD land.
  const [y, m, d] = todayStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().split("T")[0];
}
