import { z } from "zod";

export const QuestionChoiceSchema = z.object({
  label: z.string().regex(/^[A-D]$/),
  text: z.string().min(1),
});

export const GeneratedQuestionSchema = z.object({
  passage_text: z.string().min(20).max(1500),
  question_text: z.string().min(10),
  choices: z.array(QuestionChoiceSchema).length(4),
  correct_answer: z.string().regex(/^[A-D]$/),
  explanations: z.record(z.string().regex(/^[A-D]$/), z.string().min(1)),
  difficulty_rating: z.number().int().min(200).max(900),
});

export const GeneratedQuestionsArraySchema = z.array(GeneratedQuestionSchema);

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;
