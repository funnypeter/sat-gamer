import type { QuestionChoice } from "@/lib/types/database";

const LABELS = ["A", "B", "C", "D"];

export interface ShuffledChoices {
  choices: QuestionChoice[];
  /** displayed label -> original label */
  choiceMap: Record<string, string>;
}

function fisherYates<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function relabel(originals: QuestionChoice[]): ShuffledChoices {
  const shuffled = fisherYates(originals);
  const choices: QuestionChoice[] = [];
  const choiceMap: Record<string, string> = {};
  for (let i = 0; i < shuffled.length; i++) {
    const newLabel = LABELS[i] ?? shuffled[i].label;
    choices.push({ label: newLabel, text: shuffled[i].text });
    choiceMap[newLabel] = shuffled[i].label;
  }
  return { choices, choiceMap };
}

/**
 * Shuffle and relabel choices so the correct answer ends up under a
 * different displayed label than it had originally — otherwise a
 * student who memorized "the answer is C" would still find it under C.
 */
export function shuffleChoices(
  originals: QuestionChoice[],
  correctAnswer: string,
): ShuffledChoices {
  if (originals.length < 2) {
    const choiceMap: Record<string, string> = {};
    for (const c of originals) choiceMap[c.label] = c.label;
    return { choices: [...originals], choiceMap };
  }
  let result = relabel(originals);
  for (let attempt = 0; attempt < 20; attempt++) {
    const newLabelOfCorrect = Object.entries(result.choiceMap).find(
      ([, original]) => original === correctAnswer,
    )?.[0];
    if (newLabelOfCorrect && newLabelOfCorrect !== correctAnswer) return result;
    result = relabel(originals);
  }
  return result;
}
