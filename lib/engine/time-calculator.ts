import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { FamilySettings } from "@/lib/types/database";

const defaultSettings: FamilySettings = {
  accuracyTiers: [...DEFAULT_SETTINGS.accuracyTiers],
  decayDays: DEFAULT_SETTINGS.decayDays,
  dailyCapMinutes: DEFAULT_SETTINGS.dailyCapMinutes,
  weekendBaseMinutes: DEFAULT_SETTINGS.weekendBaseMinutes,
  blockMinutes: DEFAULT_SETTINGS.blockMinutes,
};

/**
 * Given an accuracy percentage and family settings, return minutes earned for a block.
 */
export function calculateMinutesEarned(
  accuracyPercent: number,
  settings: FamilySettings = defaultSettings
): number {
  for (const tier of settings.accuracyTiers) {
    if (accuracyPercent >= tier.min) {
      return tier.minutes;
    }
  }
  // Fallback — should never reach here if tiers include min:0
  return 5;
}

/**
 * Check how many minutes the student has earned today and whether
 * they've hit the daily cap.
 *
 * @returns { earnedToday, remaining, capped }
 */
export function checkDailyCap(
  minutesEarnedToday: number,
  newMinutes: number,
  settings: FamilySettings = defaultSettings
): { awarded: number; earnedToday: number; capped: boolean } {
  const cap = settings.dailyCapMinutes;
  const totalAfter = minutesEarnedToday + newMinutes;

  if (totalAfter <= cap) {
    return {
      awarded: newMinutes,
      earnedToday: totalAfter,
      capped: false,
    };
  }

  const awarded = Math.max(0, cap - minutesEarnedToday);
  return {
    awarded,
    earnedToday: minutesEarnedToday + awarded,
    capped: true,
  };
}

/**
 * Calculate the expiration date for earned time.
 */
export function getExpirationDate(
  earnedAt: Date,
  decayDays: number = DEFAULT_SETTINGS.decayDays
): Date {
  const expires = new Date(earnedAt);
  expires.setDate(expires.getDate() + decayDays);
  return expires;
}
