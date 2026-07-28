import { VOCAB_MASTERY } from "@/lib/constants";
import { addDays, todayInAppTimezone } from "@/lib/date";

/**
 * Spaced repetition for vocabulary, scheduled by *word* rather than by item.
 *
 * Passage questions schedule by question id (`spaced_repetition`) because the
 * unit being learned is that specific passage-and-stem. Vocabulary's unit is
 * the word — the sentence it appeared in is disposable — so a miss on any
 * sentence for "obdurate" reschedules the word, and the next review may well
 * use a different sentence.
 *
 * The other difference from the question flow: a correct review does not
 * retire the word immediately. Questions delete the SR row on the first
 * correct review, on the reasoning that re-proving a specific question is
 * low value. A word answered right once is not learned — it's likely a lucky
 * elimination among four choices. It takes `consecutiveCorrectToMaster`
 * correct answers at widening intervals before the word counts as mastered,
 * and even then it stays on a long refresher schedule rather than dropping
 * out of the rotation for good.
 */

export interface MasteryState {
  times_seen: number;
  times_correct: number;
  consecutive_correct: number;
  mastered: boolean;
  next_review_date: string | null;
  interval_days: number;
  ease_factor: number;
}

export const INITIAL_MASTERY: MasteryState = {
  times_seen: 0,
  times_correct: 0,
  consecutive_correct: 0,
  mastered: false,
  next_review_date: null,
  interval_days: 1,
  ease_factor: 2.5,
};

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

/**
 * Compute the new mastery row for a word after one answer.
 *
 * Intervals come from `VOCAB_MASTERY.reviewIntervalDays`, scaled by the
 * word's ease factor. Ease is what makes the schedule adapt to *this*
 * student on *this* word: a word missed twice sits at ease 2.1 and comes back
 * in 6 days instead of 7 at the same stage, while a word answered right every
 * time stretches slightly. Without the scaling the ease column would be
 * decoration — every word at a given stage would return on the same day
 * regardless of how much trouble it had caused.
 */
export function nextMastery(
  prev: MasteryState,
  isCorrect: boolean,
  today: string = todayInAppTimezone()
): MasteryState {
  const times_seen = prev.times_seen + 1;
  const times_correct = prev.times_correct + (isCorrect ? 1 : 0);

  if (!isCorrect) {
    // A miss resets the streak and un-masters the word. Coming back tomorrow
    // (not later today) is deliberate: same-session re-drilling tests short-
    // term memory, which is exactly what spacing is meant to bypass.
    return {
      times_seen,
      times_correct,
      consecutive_correct: 0,
      mastered: false,
      next_review_date: addDays(today, 1),
      interval_days: 1,
      ease_factor: clamp(prev.ease_factor - 0.2, MIN_EASE, MAX_EASE),
    };
  }

  const consecutive_correct = prev.consecutive_correct + 1;
  const ease_factor = clamp(prev.ease_factor + 0.1, MIN_EASE, MAX_EASE);

  if (consecutive_correct >= VOCAB_MASTERY.consecutiveCorrectToMaster) {
    // Learned — but not retired. The word leaves the active learning queue
    // (the in-flight cap counts unmastered words only, so new words keep
    // flowing in its place) and moves onto a long refresher schedule: three
    // weeks, then six, then three months, widening each time it survives.
    //
    // Retiring outright was the previous behaviour and it quietly lost words:
    // three correct answers inside a fortnight proves recent recall, not
    // durable memory, and a word never shown again after that is a word the
    // student can forget without the app ever noticing. A missed refresher
    // un-masters the word and drops it straight back to the 1/3/7 schedule.
    //
    // Ease deliberately does not scale these. At three weeks and up, a ±0.2
    // ease nudge is noise next to the interval itself.
    const masteredStage = Math.min(
      consecutive_correct - VOCAB_MASTERY.consecutiveCorrectToMaster,
      VOCAB_MASTERY.masteredReviewIntervalDays.length - 1
    );
    const interval_days =
      VOCAB_MASTERY.masteredReviewIntervalDays[masteredStage];

    return {
      times_seen,
      times_correct,
      consecutive_correct,
      mastered: true,
      next_review_date: addDays(today, interval_days),
      interval_days,
      ease_factor,
    };
  }

  const stage = Math.min(
    consecutive_correct - 1,
    VOCAB_MASTERY.reviewIntervalDays.length - 1
  );
  const base = VOCAB_MASTERY.reviewIntervalDays[stage];
  const interval_days = Math.max(1, Math.round((base * ease_factor) / DEFAULT_EASE));

  return {
    times_seen,
    times_correct,
    consecutive_correct,
    mastered: false,
    next_review_date: addDays(today, interval_days),
    interval_days,
    ease_factor,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
