import { VOCAB_WORDS, getVocabWord, type VocabWord } from "./word-list";
import { VOCAB_MASTERY } from "@/lib/constants";
import { todayInAppTimezone, dateInAppTimezone } from "@/lib/date";

/**
 * Vocabulary selection.
 *
 * This module is the single source of truth for "which word next" — the same
 * convention `lib/engine/question-selector.ts` follows for passage questions.
 * `/api/vocab/next` delegates here and handles only the generation fallback.
 * Don't reintroduce selection logic in the route.
 */

/**
 * How many words a student may be actively learning at once. Past this, no
 * new words are introduced and the session pulls from words already in
 * progress, even ones not yet due.
 *
 * Without a cap the selector introduces a brand-new word every rep, because
 * unseen words always outnumber due reviews early on. The student ends a week
 * having met 200 words once each and learned none. Twenty is roughly what a
 * Leitner-style queue sustains for a daily-practice teenager.
 */
export const IN_FLIGHT_LIMIT = 20;

export interface MasteryRow {
  word: string;
  mastered: boolean;
  next_review_date: string | null;
  consecutive_correct: number;
  last_seen_at: string | null;
}

export interface VocabItemRow {
  id: string;
  word: string;
  sentence: string;
  choices: { label: string; text: string }[];
  correct_answer: string;
  explanations: Record<string, string>;
  tier: number;
}

export type SelectionReason = "review" | "new" | "early-review" | "refresher";

export interface VocabSelection {
  item: VocabItemRow;
  word: VocabWord;
  reason: SelectionReason;
  /** True when the student has answered this exact item before. */
  repeat: boolean;
}

/**
 * Build the ordered list of words to try, most appropriate first.
 *
 * Cascade (first match wins, then falls through to the next word if that
 * word has no generated item available):
 *   1. `review`       — due today or overdue, not yet mastered.
 *   2. `new`          — an unseen word from the lowest tier that still has
 *                       one, while under the in-flight cap.
 *   3. `early-review` — at the cap with nothing due: the least recently seen
 *                       unmastered word, pulled forward. Excludes anything
 *                       already answered today.
 *   4. `new` overflow — still nothing: introduce unseen words past the cap
 *                       rather than re-drill today's.
 *   5. `refresher`    — mastered words, oldest first, not seen today.
 *   6. anything left, including words already seen today. Last resort so a
 *                       long session never dead-ends on "nothing to do".
 *
 * Steps 3-5 all exclude words answered earlier the same day, and that
 * exclusion is the whole reason mastery can't be farmed in one sitting.
 * `consecutiveCorrectToMaster` is 3, and without the same-day filter a
 * student sitting at the in-flight cap would be served the same word three
 * times in ten minutes and "master" it having proved only short-term recall —
 * exactly what the spacing schedule exists to prevent.
 */
export function orderCandidateWords(
  mastery: MasteryRow[],
  today: string = todayInAppTimezone()
): { word: VocabWord; reason: SelectionReason }[] {
  const seen = new Map(mastery.map((m) => [m.word, m]));
  const unmastered = mastery.filter((m) => !m.mastered);
  const seenToday = (m: MasteryRow) =>
    m.last_seen_at !== null && dateInAppTimezone(new Date(m.last_seen_at)) === today;

  const candidates: { word: VocabWord; reason: SelectionReason }[] = [];
  const added = new Set<string>();
  const push = (w: VocabWord | undefined, reason: SelectionReason) => {
    // A word can disappear from the list between releases (renamed, culled).
    // Its mastery row survives; skip it rather than crash the session.
    if (!w || added.has(w.word)) return;
    added.add(w.word);
    candidates.push({ word: w, reason });
  };

  const oldestFirst = (a: MasteryRow, b: MasteryRow) =>
    (a.last_seen_at ?? "") < (b.last_seen_at ?? "") ? -1 : 1;

  // 1. Due reviews, most overdue first.
  unmastered
    .filter((m) => m.next_review_date !== null && m.next_review_date <= today)
    .sort((a, b) => (a.next_review_date! < b.next_review_date! ? -1 : 1))
    .forEach((m) => push(getVocabWord(m.word), "review"));

  // 2. New words, lowest tier first, while under the cap.
  const unseen = VOCAB_WORDS.filter((w) => !seen.has(w.word)).sort(
    (a, b) => a.tier - b.tier
  );
  if (unmastered.length < IN_FLIGHT_LIMIT) {
    unseen
      .slice(0, IN_FLIGHT_LIMIT - unmastered.length)
      .forEach((w) => push(w, "new"));
  }

  // 3. Pulled-forward reviews, but not words already answered today.
  unmastered
    .filter((m) => !seenToday(m))
    .sort(oldestFirst)
    .forEach((m) => push(getVocabWord(m.word), "early-review"));

  // 4. Overflow past the cap: meeting a new word beats re-drilling one from
  //    an hour ago.
  unseen.forEach((w) => push(w, "new"));

  // 5. Mastered words as refreshers, oldest first, not seen today.
  mastery
    .filter((m) => m.mastered && !seenToday(m))
    .sort(oldestFirst)
    .forEach((m) => push(getVocabWord(m.word), "refresher"));

  // 6. Everything else, same-day repeats included. Only reached when the
  //    entire list has been touched today.
  mastery
    .slice()
    .sort(oldestFirst)
    .forEach((m) =>
      push(getVocabWord(m.word), m.mastered ? "refresher" : "early-review")
    );

  return candidates;
}

/**
 * Given the ordered candidates plus the items and attempt history fetched for
 * them, choose the item to serve.
 *
 * Prefers a sentence the student has never seen for that word. Falls back to
 * their least recently seen sentence, which is still useful — the word is
 * what's being learned, and by the time a sentence recurs it has usually been
 * weeks. Falls through to the next candidate word only when the word has no
 * generated items at all.
 */
export function chooseItem(
  candidates: { word: VocabWord; reason: SelectionReason }[],
  itemsByWord: Map<string, VocabItemRow[]>,
  lastAttemptByItem: Map<string, string>
): VocabSelection | null {
  for (const { word, reason } of candidates) {
    const items = itemsByWord.get(word.word);
    if (!items || items.length === 0) continue;

    const unattempted = items.filter((i) => !lastAttemptByItem.has(i.id));
    if (unattempted.length > 0) {
      // Rotate through variants by creation order rather than at random, so a
      // word's second sighting is reliably a different sentence.
      return { item: unattempted[0], word, reason, repeat: false };
    }

    const oldest = [...items].sort((a, b) =>
      (lastAttemptByItem.get(a.id) ?? "") < (lastAttemptByItem.get(b.id) ?? "") ? -1 : 1
    )[0];
    return { item: oldest, word, reason, repeat: true };
  }

  return null;
}

/**
 * Words that should be topped up by background generation: anything in the
 * candidate queue holding fewer than `itemsPerWordTarget` sentences.
 */
export function wordsNeedingItems(
  candidates: { word: VocabWord }[],
  itemsByWord: Map<string, VocabItemRow[]>,
  limit: number
): VocabWord[] {
  const need: VocabWord[] = [];
  for (const { word } of candidates) {
    const have = itemsByWord.get(word.word)?.length ?? 0;
    if (have < VOCAB_MASTERY.itemsPerWordTarget) need.push(word);
    if (need.length >= limit) break;
  }
  return need;
}
