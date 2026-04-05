import type { PineSATQuestion } from "./pinesat-client";

export interface TransformedQuestion {
  passage_text: string;
  question_text: string;
  choices: { label: string; text: string }[];
  correct_answer: string;
  difficulty_rating: number;
  generated_by: string;
  // These get filled in by Gemini enrichment
  category?: string;
  explanations?: Record<string, string>;
  // Keep original explanation for Gemini context
  _originalExplanation: string;
  _originalDomain: string;
}

const DIFFICULTY_MAP: Record<string, number> = {
  Easy: 375,
  Medium: 525,
  Hard: 700,
};

export function transformPineSATQuestion(q: PineSATQuestion): TransformedQuestion {
  const choices = (["A", "B", "C", "D"] as const).map((label) => ({
    label,
    text: q.question.choices[label] ?? "",
  }));

  return {
    passage_text: q.question.paragraph,
    question_text: q.question.question,
    choices,
    correct_answer: q.question.correct_answer,
    difficulty_rating: DIFFICULTY_MAP[q.difficulty] ?? 525,
    generated_by: "collegeboard",
    _originalExplanation: q.question.explanation ?? "",
    _originalDomain: q.domain,
  };
}
