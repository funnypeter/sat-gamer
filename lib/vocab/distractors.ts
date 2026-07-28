import { VOCAB_WORDS, type VocabWord } from "./word-list";

/**
 * Distractor selection for vocabulary items.
 *
 * The wrong answers are real words drawn from the same bank, not invented
 * ones — a student who doesn't know the target still gets three more real
 * exposures per item, and the choices look like a genuine DSAT Words-in-
 * Context set rather than an obvious three-nonsense-one-real giveaway.
 *
 * Two hard constraints, both of which exist because violating them produces
 * an item with no defensible answer:
 *
 * 1. **Same part of speech.** If the blank needs an adjective and three of
 *    four choices are verbs, grammar alone solves the item and nothing about
 *    the word's meaning is tested.
 *
 * 2. **Different `sense` cluster.** "obdurate" against "intransigent" has two
 *    correct answers. The `sense` tag in the word list is the guard: never
 *    draw a distractor tagged the same as the target. Untagged words are
 *    treated as having no close cousins and are always eligible.
 *
 * Tier proximity is a *preference*, not a constraint — a tier-3 target
 * surrounded by tier-1 distractors is too easy to solve by elimination, so we
 * fill from the same tier first and widen only if that pool is too thin
 * (which it can be for nouns, the smallest part-of-speech group).
 */

/**
 * Deterministic PRNG (mulberry32). Seeded from the word plus the variant
 * index so regenerating variant 3 of "obdurate" reselects the same three
 * distractors. That keeps generation idempotent: a retried batch produces
 * identical items rather than near-duplicates that both survive the
 * content-hash unique index.
 */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export interface DistractorOptions {
  /** Which sentence variant this is for. Seeds the PRNG. */
  variantIndex: number;
  /** How many distractors to return. Always 3 for a 4-choice item. */
  count?: number;
}

/**
 * Pick `count` distractor words for `target`.
 *
 * Returns fewer than `count` only when the bank genuinely cannot supply
 * enough same-part-of-speech words outside the target's sense cluster. The
 * caller must treat a short return as "skip this word" rather than padding
 * with a wrong-part-of-speech filler.
 */
export function pickDistractors(
  target: VocabWord,
  { variantIndex, count = 3 }: DistractorOptions
): VocabWord[] {
  const rand = seededRandom(`${target.word}:${variantIndex}`);

  const eligible = VOCAB_WORDS.filter(
    (w) =>
      w.word !== target.word &&
      w.pos === target.pos &&
      // Untagged words have no declared cousins; only exclude on a real
      // tag-to-tag collision.
      !(target.sense !== undefined && w.sense === target.sense)
  );

  // Same tier first, then one tier away, then anything left. Each band is
  // shuffled independently so we don't always drain the list in file order.
  const byDistance = new Map<number, VocabWord[]>();
  for (const w of eligible) {
    const d = Math.abs(w.tier - target.tier);
    if (!byDistance.has(d)) byDistance.set(d, []);
    byDistance.get(d)!.push(w);
  }

  const picked: VocabWord[] = [];
  for (const distance of Array.from(byDistance.keys()).sort((a, b) => a - b)) {
    if (picked.length >= count) break;
    const band = shuffleInPlace([...byDistance.get(distance)!], rand);
    picked.push(...band.slice(0, count - picked.length));
  }

  return picked;
}

/**
 * Assemble a full 4-choice set: the target plus its distractors, shuffled
 * into A-D order. Returns the labels alongside so the caller knows which
 * letter is correct without searching.
 *
 * Note the shuffle happens here, at *generation* time, and the result is
 * stored on the item row. Vocabulary items are not re-shuffled at serve time
 * the way repeat/spaced-repetition question servings are — each item is a
 * fixed artifact, and a word is re-drilled by generating a new sentence
 * variant rather than by reordering an old one's choices. That means vocab
 * has no `choiceMap` machinery and no displayed-vs-original label space.
 */
export function buildChoiceSet(
  target: VocabWord,
  distractors: VocabWord[],
  variantIndex: number
): {
  choices: { label: string; text: string }[];
  correctAnswer: string;
  /** label -> the word list entry behind it, for building explanations */
  wordByLabel: Record<string, VocabWord>;
} {
  const rand = seededRandom(`choices:${target.word}:${variantIndex}`);
  const ordered = shuffleInPlace([target, ...distractors], rand);
  const labels = ["A", "B", "C", "D"];

  const choices = ordered.map((w, i) => ({ label: labels[i], text: w.word }));
  const wordByLabel: Record<string, VocabWord> = {};
  ordered.forEach((w, i) => {
    wordByLabel[labels[i]] = w;
  });
  const correctAnswer = labels[ordered.findIndex((w) => w.word === target.word)];

  return { choices, correctAnswer, wordByLabel };
}
