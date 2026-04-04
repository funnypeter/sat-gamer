import { DEFAULT_SETTINGS } from "@/lib/constants";

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
