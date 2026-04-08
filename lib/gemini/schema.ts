import { z } from "zod";

export const QuestionChoiceSchema = z.object({
  label: z.string().regex(/^[A-D]$/),
  text: z.string().min(1),
});

/**
 * Detects when Gemini fills passage_text with a meta-description of the
 * passage (e.g. "The author of this passage wants to...") instead of the
 * actual passage prose. These leak through and produce unanswerable questions
 * in the UI because the real passage is missing.
 */
const META_PROMPT_PATTERNS: RegExp[] = [
  /\bthe author of (this|the) passage\b/i,
  /\bthe (writer|author|speaker) (wants|aims|intends|seeks)\b/i,
  /\bthis passage (is about|describes|discusses|argues|explains)\b/i,
  /\bwhat is the most likely reason\b/i,
  /\bwhich choice best\b/i,
];

function looksLikeMetaPrompt(text: string): boolean {
  return META_PROMPT_PATTERNS.some((re) => re.test(text));
}

export const GeneratedQuestionSchema = z.object({
  passage_text: z
    .string()
    .min(20)
    .max(1500)
    .refine((t) => !looksLikeMetaPrompt(t), {
      message:
        "passage_text looks like a meta-description of a passage rather than the passage itself",
    })
    .refine((t) => !/\?\s*$/.test(t.trim()), {
      message: "passage_text must not be a question",
    }),
  question_text: z.string().min(10),
  choices: z.array(QuestionChoiceSchema).length(4),
  correct_answer: z.string().regex(/^[A-D]$/),
  explanations: z.record(z.string().regex(/^[A-D]$/), z.string().min(1)),
  difficulty_rating: z.number().int().min(200).max(900),
});

export const GeneratedQuestionsArraySchema = z.array(GeneratedQuestionSchema);

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
