import { z } from "zod";
import type { VocabWord } from "./word-list";

/**
 * Validation for Gemini-authored vocabulary sentences.
 *
 * Generation is deliberately narrow: the model writes *only* the sentence and
 * a one-line note per distractor. The word, the definition, and all four
 * choices are chosen in code (see `distractors.ts`), so the model can't drift
 * off the curated list, invent a definition, or mislabel the correct answer —
 * the three failure modes that made whole-item generation unreliable for
 * passage questions (see the meta-prompt notes in the root CLAUDE.md).
 *
 * What's left to police is the sentence itself, and the checks below are the
 * whole defense. Each one corresponds to a specific way an item becomes
 * unanswerable or trivially answerable.
 */

import { BLANK, BLANK_RUN } from "./blank";

export { BLANK } from "./blank";

export const RawVocabSentenceSchema = z.object({
  word: z.string().min(1),
  sentence: z.string().min(40).max(320),
  /** distractor word -> one line on why it doesn't fit this sentence */
  distractor_notes: z.record(z.string(), z.string().min(1)),
  /**
   * Any distractor the model judges as *also* fitting the blank. A non-empty
   * list means the item has two defensible answers and must be discarded —
   * this is the model's own escape hatch, and it's cheaper to throw the item
   * away during background generation than to serve a broken one.
   */
  unsuitable_distractors: z.array(z.string()).default([]),
});

export const RawVocabSentencesArraySchema = z.array(RawVocabSentenceSchema);

export type RawVocabSentence = z.infer<typeof RawVocabSentenceSchema>;

export type SentenceValidation =
  | { ok: true; sentence: string }
  | { ok: false; reason: string };

function containsWord(haystack: string, needle: string): boolean {
  // Catch the word and its common inflections ("placate" -> "placated",
  // "placating") without catching unrelated words that merely share a prefix.
  //
  // The naive version — truncate to a stem and match `\bstem\w*\b` — is worse
  // than useless here: "static" stems to "stat" and would reject any sentence
  // containing "statement" or "status", making some words impossible to
  // generate at all. So we anchor on the full word, allowing only the dropped
  // final -e that English inflection uses ("placate" -> "placat|ing") plus a
  // short suffix.
  const base = needle.endsWith("e") ? needle.slice(0, -1) : needle;
  const alternatives = base === needle ? needle : `${needle}|${base}`;
  return new RegExp(`\\b(?:${alternatives})\\w{0,4}\\b`, "i").test(haystack);
}

/**
 * Check a generated sentence against the word and distractors it was written
 * for. Returns the normalized sentence (blank collapsed to a canonical
 * `______`) or the reason it was rejected, which the generate route tallies
 * for diagnostics the way the College Board importer tallies its rejections.
 */
export function validateSentence(
  raw: RawVocabSentence,
  target: VocabWord,
  distractors: VocabWord[]
): SentenceValidation {
  if (raw.unsuitable_distractors.length > 0) {
    return {
      ok: false,
      reason: `ambiguous: also fits ${raw.unsuitable_distractors.join(", ")}`,
    };
  }

  const blanks = raw.sentence.match(BLANK_RUN);
  if (!blanks) return { ok: false, reason: "no blank" };
  if (blanks.length > 1) return { ok: false, reason: "multiple blanks" };

  const sentence = raw.sentence.replace(BLANK_RUN, BLANK).trim();

  // The target appearing in its own sentence hands over the answer.
  if (containsWord(sentence, target.word)) {
    return { ok: false, reason: "target word leaked into sentence" };
  }

  // A distractor in the sentence makes that choice read as an echo and
  // distorts the item even when it isn't the answer.
  for (const d of distractors) {
    if (containsWord(sentence, d.word)) {
      return { ok: false, reason: `distractor "${d.word}" leaked into sentence` };
    }
  }

  // "The senator was ______, meaning stubbornly unwilling to change" is a
  // definition with a hole in it, not a context sentence. Context has to do
  // the work, otherwise the student matches the gloss instead of reading.
  if (/\b(means?|meaning|defined as|that is to say)\b/i.test(sentence)) {
    return { ok: false, reason: "sentence restates the definition" };
  }

  // A blank at the very start gives no leading context and usually indicates
  // the model wrote a fragment rather than a sentence.
  if (sentence.startsWith(BLANK)) {
    return { ok: false, reason: "sentence opens on the blank" };
  }

  const notesGiven = Object.keys(raw.distractor_notes).map((k) => k.toLowerCase());
  const missing = distractors.filter((d) => !notesGiven.includes(d.word));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `missing notes for ${missing.map((d) => d.word).join(", ")}`,
    };
  }

  return { ok: true, sentence };
}
