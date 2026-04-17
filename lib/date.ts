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

/**
 * Return the UTC `Date` representing the most recent Monday at 00:00:00
 * in APP_TIMEZONE. Used to anchor "this week" windows for the gaming-
 * time weekly cap and the leaderboard's Weekly view — both of which
 * reset at midnight Monday Pacific rather than rolling 7 days.
 *
 * DST-safe: PT shifts between UTC-8 (PST) and UTC-7 (PDT), so Monday
 * midnight PT is either 08:00 or 07:00 UTC. We compute both candidates
 * and return whichever actually formats to midnight in APP_TIMEZONE.
 */
export function startOfWeekInAppTimezone(now: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const partsOf = (d: Date) =>
    Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));

  const p = partsOf(now);
  const year = parseInt(p.year, 10);
  const month = parseInt(p.month, 10);
  const day = parseInt(p.day, 10);
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[p.weekday];

  // Monday's calendar date in APP_TIMEZONE. Monday-start weeks mean
  // Sunday wraps to the previous Monday (6 days back), not 0.
  const daysBack = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(year, month - 1, day));
  monday.setUTCDate(monday.getUTCDate() - daysBack);
  const mY = monday.getUTCFullYear();
  const mM = monday.getUTCMonth() + 1;
  const mD = monday.getUTCDate();

  // Try PDT (UTC-7) and PST (UTC-8); return whichever formats to exactly
  // 00:00 on Monday mY-mM-mD in APP_TIMEZONE.
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(Date.UTC(mY, mM - 1, mD, offsetHours, 0, 0));
    const c = partsOf(candidate);
    if (
      parseInt(c.year, 10) === mY &&
      parseInt(c.month, 10) === mM &&
      parseInt(c.day, 10) === mD &&
      parseInt(c.hour, 10) === 0 &&
      parseInt(c.minute, 10) === 0
    ) {
      return candidate;
    }
  }
  // Fallback: assume PST. Should never happen given the range of valid offsets.
  return new Date(Date.UTC(mY, mM - 1, mD, 8, 0, 0));
}
