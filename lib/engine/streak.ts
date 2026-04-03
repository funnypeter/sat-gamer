/**
 * Update a student's streak given their last practice date.
 *
 * @param lastPracticeDate - The date string (YYYY-MM-DD) of their last practice, or null
 * @param currentStreak - The current streak count
 * @param longestStreak - The longest streak ever
 * @returns Updated streak info and any bonus minutes
 */
export function updateStreak(
  lastPracticeDate: string | null,
  currentStreak: number,
  longestStreak: number
): {
  newStreak: number;
  newLongestStreak: number;
  bonusMinutes: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // If they already practiced today, no change
  if (lastPracticeDate === todayStr) {
    return {
      newStreak: currentStreak,
      newLongestStreak: longestStreak,
      bonusMinutes: 0,
    };
  }

  // Check if last practice was yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak: number;

  if (lastPracticeDate === yesterdayStr) {
    // Continuing the streak
    newStreak = currentStreak + 1;
  } else {
    // Streak broken — start fresh at 1
    newStreak = 1;
  }

  const newLongestStreak = Math.max(longestStreak, newStreak);

  // Bonus minutes for milestone streaks
  let bonusMinutes = 0;
  if (newStreak === 7) bonusMinutes = 5;
  else if (newStreak === 14) bonusMinutes = 10;
  else if (newStreak === 30) bonusMinutes = 15;
  else if (newStreak > 0 && newStreak % 50 === 0) bonusMinutes = 20;

  return { newStreak, newLongestStreak, bonusMinutes };
}
