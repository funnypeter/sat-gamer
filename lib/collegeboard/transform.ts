import type { PineSATQuestion } from "./pinesat-client";
import type { DsatCategory } from "@/lib/constants";

const DIFFICULTY_MAP: Record<string, number> = {
  Easy: 375,
  Medium: 525,
  Hard: 700,
};

const TRANSITION_WORDS = /\b(transition|connect|link between|flow|however|therefore|moreover|furthermore|consequently|nevertheless|although|whereas|similarly|additionally|in contrast)\b/i;
const VOCAB_WORDS = /\b(word|meaning|most nearly means|closest in meaning|best defines|vocabulary|definition|synonym|context clues|as used in)\b/i;
const PURPOSE_WORDS = /\b(purpose|function|structure|role|serves to|in order to|effect of|why does the author|main idea of the|how does)\b/i;
const QUANTITATIVE_WORDS = /\b(table|graph|chart|figure|data|percent|number|statistic|increase|decrease|rate|proportion|survey|study found|according to the)\b/i;
const EVIDENCE_WORDS = /\b(evidence|support|which choice|best supports|quotation|cite|substantiate|strengthen|weaken|undermine)\b/i;
const INFERENCE_WORDS = /\b(infer|suggest|imply|most likely|can be concluded|based on the passage|it can be reasoned|would most likely)\b/i;

export function mapCategory(domain: string, questionText: string, passageText: string): DsatCategory {
  const combined = `${questionText} ${passageText}`;

  if (domain === "Standard English Conventions") {
    return "Standard English Conventions";
  }

  if (domain === "Expression of Ideas") {
    if (TRANSITION_WORDS.test(combined)) return "Transitions";
    return "Rhetoric";
  }

  if (domain === "Craft and Structure") {
    if (VOCAB_WORDS.test(combined)) return "Words in Context";
    if (PURPOSE_WORDS.test(combined)) return "Text Structure & Purpose";
    return "Cross-Text Connections";
  }

  // "Information and Ideas" or unknown
  if (QUANTITATIVE_WORDS.test(combined)) return "Command of Evidence (Quantitative)";
  if (EVIDENCE_WORDS.test(combined)) return "Command of Evidence (Textual)";
  if (INFERENCE_WORDS.test(combined)) return "Inferences";
  return "Central Ideas & Details";
}

export interface TransformedQuestion {
  category: DsatCategory;
  passage_text: string;
  question_text: string;
  choices: { label: string; text: string }[];
  correct_answer: string;
  explanations: Record<string, string>;
  difficulty_rating: number;
  generated_by: string;
}

export function transformPineSATQuestion(q: PineSATQuestion): TransformedQuestion {
  const choices = (["A", "B", "C", "D"] as const).map((label) => ({
    label,
    text: q.question.choices[label] ?? "",
  }));

  const category = mapCategory(q.domain, q.question.question, q.question.paragraph);

  // Put the explanation on the correct answer key; leave others empty
  const explanations: Record<string, string> = { A: "", B: "", C: "", D: "" };
  explanations[q.question.correct_answer] = q.question.explanation ?? "";

  return {
    category,
    passage_text: q.question.paragraph,
    question_text: q.question.question,
    choices,
    correct_answer: q.question.correct_answer,
    explanations,
    difficulty_rating: DIFFICULTY_MAP[q.difficulty] ?? 525,
    generated_by: "collegeboard",
  };
}
