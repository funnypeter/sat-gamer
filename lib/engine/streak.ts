import { todayInAppTimezone, yesterdayOf } from "@/lib/date";

/**
 * Update a student's streak given their last practice date.
 *
 * IMPORTANT: `todayStr` must be computed in the app's timezone
 * (`todayInAppTimezone()`), not from server UTC. Callers should not
 * use `new Date().toISOString().split("T")[0]` because that gives UTC,
 * which rolls the date forward for evening-PT practice and creates
 * false streak breaks.
 *
 * @param lastPracticeDate - YYYY-MM-DD of last practice (in app tz), or null
 * @param currentStreak - Current stored streak count
 * @param longestStreak - Longest streak ever
 * @param todayStr - YYYY-MM-DD representing today in the app timezone
 */
export function updateStreak(
  lastPracticeDate: string | null,
  currentStreak: number,
  longestStreak: number,
  todayStr: string = todayInAppTimezone()
): {
  newStreak: number;
  newLongestStreak: number;
  bonusMinutes: number;
} {
  // Already practiced today — no change
  if (lastPracticeDate === todayStr) {
    return {
      newStreak: currentStreak,
      newLongestStreak: longestStreak,
      bonusMinutes: 0,
    };
  }

  const yesterdayStr = yesterdayOf(todayStr);

  const newStreak =
    lastPracticeDate === yesterdayStr ? currentStreak + 1 : 1;

  const newLongestStreak = Math.max(longestStreak, newStreak);

  let bonusMinutes = 0;
  if (newStreak === 7) bonusMinutes = 5;
  else if (newStreak === 14) bonusMinutes = 10;
  else if (newStreak === 30) bonusMinutes = 15;
  else if (newStreak > 0 && newStreak % 50 === 0) bonusMinutes = 20;

  return { newStreak, newLongestStreak, bonusMinutes };
}

/**
 * Compute the streak value to *display* given the stored state and the
 * current date. The stored `current_streak` column represents the
 * streak as of the student's last practice. If the student has since
 * missed a full day, the streak is effectively broken and we show 0 —
 * even though the stored value is stale.
 *
 * The stored value only gets rewritten on the next session end, so
 * without this helper a student who hasn't practiced in days still
 * sees their old streak count in the UI.
 *
 * @param lastPracticeDate - YYYY-MM-DD of last practice (app tz)
 * @param storedStreak - The `current_streak` column value
 * @param todayStr - YYYY-MM-DD representing today in the app timezone
 */
export function effectiveStreak(
  lastPracticeDate: string | null,
  storedStreak: number,
  todayStr: string = todayInAppTimezone()
): number {
  if (!lastPracticeDate) return 0;
  if (lastPracticeDate === todayStr) return storedStreak;
  if (lastPracticeDate === yesterdayOf(todayStr)) return storedStreak;
  return 0;
}
