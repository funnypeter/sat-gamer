/**
 * College Board ships one monolithic rationale per question that discusses
 * all four choices (e.g. "Choice D is the best answer because... Choice A
 * is incorrect because... Choice B is incorrect because..."). Our importer
 * stores the whole thing on the correct answer's letter (see
 * lib/collegeboard/transform.ts), which means picking C and reading the
 * explanation under D dumps a 400-word wall on the student.
 *
 * Detect that pattern and split it into per-choice chunks so each letter
 * shows only its own slice. Falls back to the original explanations object
 * if the text doesn't match the CB pattern (Gemini explanations are already
 * per-choice).
 *
 * NOTE: the returned keys are the letters *referenced in the prose* — i.e.
 * the question's original A/B/C/D labels. For SR-review questions whose
 * choices have been shuffled and relabeled, run remapExplanationsToDisplayed
 * afterward to move each chunk onto the label the student actually saw.
 */
export function splitCbRationale(
  explanations: Record<string, string>
): Record<string, string> {
  const nonEmpty = Object.entries(explanations).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0
  );
  // If multiple letters already have content, the explanations are
  // already per-choice (Gemini case) — leave them alone.
  if (nonEmpty.length !== 1) return explanations;

  const [, monolithic] = nonEmpty[0];
  // Walk the text finding "Choice X is the best answer | correct | incorrect"
  // markers, then slice between consecutive marker positions.
  const markerRe = /Choice\s+([A-D])\s+is\s+(?:the\s+best\s+answer|correct|incorrect)/gi;
  const matches: Array<{ letter: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(monolithic)) !== null) {
    matches.push({ letter: m[1].toUpperCase(), start: m.index });
  }
  // Need at least 2 markers to be confident we're parsing the CB pattern.
  if (matches.length < 2) return explanations;

  const split: Record<string, string> = { A: "", B: "", C: "", D: "" };
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : monolithic.length;
    split[matches[i].letter] = monolithic.substring(start, end).trim();
  }
  return split;
}

/** Rewrite a leading "Choice X" reference to a new letter. */
function rewriteLeadingChoiceLetter(text: string, letter: string): string {
  return text.replace(/^(\s*Choice\s+)[A-D]\b/i, `$1${letter}`);
}

/**
 * Translate explanation chunks from the question's original A/B/C/D labels
 * into the shuffled "displayed" labels a student actually saw on an
 * SR-review question.
 *
 * `choiceMap` is displayed -> original (as returned by shuffleChoices); we
 * invert it to original -> displayed. We split the CB rationale first so the
 * chunks are keyed by original letter, then move each chunk onto its
 * displayed label. CB chunks also embed the original letter in their prose
 * ("Choice A is the best answer"), so we rewrite that leading letter to the
 * displayed one — otherwise the green (correct) choice would still read
 * "Choice A is the best answer" while sitting under a different label.
 */
export function remapExplanationsToDisplayed(
  explanations: Record<string, string>,
  choiceMap: Record<string, string>
): Record<string, string> {
  const split = splitCbRationale(explanations);
  const reverseMap: Record<string, string> = {};
  for (const [displayed, original] of Object.entries(choiceMap)) {
    reverseMap[original] = displayed;
  }
  const out: Record<string, string> = {};
  for (const [original, text] of Object.entries(split)) {
    const displayed = reverseMap[original] ?? original;
    out[displayed] = rewriteLeadingChoiceLetter(text, displayed);
  }
  return out;
}
