import type { DifficultyBand, DsatCategory } from "@/lib/constants";
import { DIFFICULTY_BANDS } from "@/lib/constants";

export function buildQuestionGenerationPrompt(
  category: DsatCategory,
  difficultyBand: DifficultyBand
): string {
  const band = DIFFICULTY_BANDS[difficultyBand];

  return `You are an expert Digital SAT (DSAT) Reading & Writing question author. Generate exactly 10 high-quality practice questions for the following specifications.

Category: ${category}
Difficulty Band: ${difficultyBand} (rating ${band.min}–${band.max})

REQUIREMENTS:
- Each question must be in the Digital SAT (DSAT) Reading & Writing format
- Include a passage_text (25–150 words) that is the basis for the question
- Include a clear question_text
- Provide exactly 4 answer choices labeled A, B, C, D
- Specify the correct_answer as a single letter (A, B, C, or D)
- Provide explanations for ALL four choices explaining why each is correct or incorrect
- Assign a difficulty_rating as an integer between ${band.min} and ${band.max}
- Make passages realistic and varied (literature, science, history, social studies)
- Ensure questions genuinely test "${category}" skills
- Vary the correct answer position across questions (don't always make it the same letter)

OUTPUT FORMAT:
Return ONLY a valid JSON array. No markdown, no code fences, no extra text. Just the JSON array.

EXAMPLE of ONE question object in the array:
{
  "passage_text": "The recent discovery of high-altitude microorganisms has challenged scientists' understanding of the limits of life. Researchers found thriving bacterial colonies at elevations above 6,000 meters in the Atacama Desert, where UV radiation is intense and oxygen levels are minimal. These extremophiles appear to derive energy from trace atmospheric chemicals rather than sunlight or organic matter.",
  "question_text": "Which choice best describes the function of the underlined sentence in the overall structure of the passage?",
  "choices": [
    {"label": "A", "text": "It introduces a counterargument to the main claim."},
    {"label": "B", "text": "It provides a specific detail that supports the discovery mentioned earlier."},
    {"label": "C", "text": "It offers a hypothesis that the passage later refutes."},
    {"label": "D", "text": "It summarizes the passage's central finding."}
  ],
  "correct_answer": "B",
  "explanations": {
    "A": "The sentence does not introduce a counterargument; it continues to describe the discovery.",
    "B": "Correct. The sentence provides specific details (elevation, UV radiation, oxygen levels) that elaborate on the discovery introduced in the first sentence.",
    "C": "The sentence states observed facts, not a hypothesis, and nothing is refuted later.",
    "D": "The sentence provides supporting detail, not a summary of the central finding."
  },
  "difficulty_rating": 420
}

Now generate 10 questions as a JSON array:`;
}
