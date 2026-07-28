import type { VocabWord } from "./word-list";

export interface SentenceRequest {
  target: VocabWord;
  distractors: VocabWord[];
  /** Which variant of this word we're asking for; steers the model off repeats. */
  variantIndex: number;
}

/**
 * Contexts the model is rotated through so successive variants of the same
 * word don't all land in the same register. Without this, every third
 * sentence is about a scientist publishing a study.
 */
const SETTINGS = [
  "a scientific or research context",
  "a historical or political context",
  "a literary, artistic, or musical context",
  "an everyday school, family, or workplace situation",
  "a business, economic, or technological context",
  "a nature, environmental, or exploration context",
];

/**
 * Build the batch prompt for vocabulary sentence generation.
 *
 * The model's job is deliberately small — write the sentence, explain why
 * each distractor fails, and flag its own ambiguity. Everything else about
 * the item (which word is correct, what the choices are, what the definition
 * says) is fixed in code before this prompt is built, so there is nothing for
 * the model to get wrong about the item's structure.
 *
 * The self-check (`unsuitable_distractors`) matters more than it looks. Code
 * already refuses to pair words from the same `sense` cluster, but that tag
 * is coarse: "sanguine" and "ebullient" sit in different clusters yet can
 * both fit "the investors were ______ about the merger." The model sees the
 * actual sentence it just wrote and is the only checker that can catch that.
 * Flagged items are discarded, not repaired.
 */
export function buildVocabSentencePrompt(requests: SentenceRequest[]): string {
  const items = requests
    .map((r, i) => {
      const setting = SETTINGS[(r.variantIndex + i) % SETTINGS.length];
      const distractorLines = r.distractors
        .map((d) => `      - ${d.word} (${d.pos}): ${d.definition}`)
        .join("\n");
      return `  ${i + 1}. TARGET: ${r.target.word} (${r.target.pos})
     DEFINITION: ${r.target.definition}
     SETTING TO USE: ${setting}
     DISTRACTORS (these will be the wrong answer choices):
${distractorLines}`;
    })
    .join("\n\n");

  return `You are writing sentence-completion vocabulary items for a high school student preparing for the Digital SAT Reading & Writing section.

For each TARGET word below, write ONE sentence with the target word removed and replaced by a blank of exactly six underscores: ______

Rules for the sentence — all of them matter:

1. CONTEXT MUST DETERMINE THE ANSWER. A careful reader who knows all four words must be able to tell that only the target fits. Build in a concrete clue — a contrast, a consequence, an example, a cause — that rules the others out. Do not write a bland frame like "She was very ______ about it."
2. NEVER write the target word, or any distractor, anywhere in the sentence (in any form).
3. NEVER define the word inside the sentence. Do not write "______, meaning stubborn," or any appositive that glosses the blank. The student must infer from context, not read a definition.
4. The blank must not be the first word of the sentence.
5. One sentence only, 15-40 words, at a level appropriate for a strong high school reader. Use the SETTING given for that item.
6. Write in the register of published prose, not a textbook exercise. Real subjects, real specifics.

Then, for each distractor, write ONE short line (under 20 words) saying why that word does NOT fit THIS sentence. Refer to the specific clue in your sentence. These are shown to the student after they answer, so write them to the student, in plain language.

Finally, check your own work: if any distractor could ALSO reasonably complete your sentence, list it in "unsuitable_distractors". Be strict — an item with two defensible answers is worse than no item. If you list a word there, we discard the item, so there is no penalty for flagging.

Items:

${items}

Return ONLY a JSON array, no markdown fences, no commentary. One object per item, in the same order:

[
  {
    "word": "<the target word, exactly as given>",
    "sentence": "<your sentence containing ______>",
    "distractor_notes": {
      "<distractor word>": "<why it doesn't fit this sentence>",
      "<distractor word>": "...",
      "<distractor word>": "..."
    },
    "unsuitable_distractors": []
  }
]`;
}

/**
 * The per-choice explanation map stored on the item, in the same shape the
 * practice flow's `explanations` column uses so `FeedbackOverlay`-style
 * rendering stays consistent: correct choice gets the definition, wrong
 * choices get the model's note plus their own definition.
 */
export function buildExplanations(
  target: VocabWord,
  wordByLabel: Record<string, VocabWord>,
  notes: Record<string, string>
): Record<string, string> {
  const notesLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(notes)) notesLower[k.toLowerCase()] = v;

  const explanations: Record<string, string> = {};
  for (const [label, word] of Object.entries(wordByLabel)) {
    if (word.word === target.word) {
      explanations[label] = `Correct. ${capitalize(word.word)} means ${word.definition}.`;
    } else {
      const note = notesLower[word.word];
      explanations[label] = note
        ? `${capitalize(word.word)} means ${word.definition}. ${note}`
        : `${capitalize(word.word)} means ${word.definition} — which doesn't fit this context.`;
    }
  }
  return explanations;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
