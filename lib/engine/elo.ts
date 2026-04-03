import { ELO_K_FACTOR } from "@/lib/constants";

/**
 * Calculate the new Elo rating for a student after answering a question.
 *
 * @param studentRating - Current Elo rating of the student
 * @param questionDifficulty - Difficulty rating of the question
 * @param isCorrect - Whether the student answered correctly
 * @returns New Elo rating (clamped to 200–900)
 */
export function calculateNewElo(
  studentRating: number,
  questionDifficulty: number,
  isCorrect: boolean
): number {
  // Expected probability the student answers correctly
  const expected =
    1 / (1 + Math.pow(10, (questionDifficulty - studentRating) / 400));

  // Actual outcome: 1 for correct, 0 for incorrect
  const actual = isCorrect ? 1 : 0;

  // New rating
  const newRating = Math.round(
    studentRating + ELO_K_FACTOR * (actual - expected)
  );

  // Clamp between 200 and 900
  return Math.max(200, Math.min(900, newRating));
}
