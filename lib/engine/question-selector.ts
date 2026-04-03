import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/lib/types/database";

/**
 * Select the next question for a student.
 *
 * Priority:
 * 1. Spaced repetition items due today
 * 2. Elo-matched unseen questions weighted toward weakest categories
 *
 * @returns A question or null if no questions are available
 */
export async function selectNextQuestion(
  supabase: SupabaseClient,
  studentId: string
): Promise<Question | null> {
  // 1. Check for spaced repetition items due today
  const today = new Date().toISOString().split("T")[0];

  const { data: srItems } = await supabase
    .from("spaced_repetition")
    .select("question_id")
    .eq("student_id", studentId)
    .lte("next_review_date", today)
    .order("next_review_date", { ascending: true })
    .limit(1);

  if (srItems && srItems.length > 0) {
    const { data: question } = await supabase
      .from("questions")
      .select("*")
      .eq("id", srItems[0].question_id)
      .single();

    if (question) return question as Question;
  }

  // 2. Get student stats to find weakest category
  const { data: stats } = await supabase
    .from("student_stats")
    .select("*")
    .eq("student_id", studentId)
    .order("elo_rating", { ascending: true });

  // Get list of questions the student has already answered
  const { data: answered } = await supabase
    .from("student_questions")
    .select("question_id")
    .eq("student_id", studentId);

  const answeredIds = new Set(
    (answered ?? []).map((a) => a.question_id)
  );

  // Determine target difficulty and category
  let targetElo = 500; // default for new students
  let targetCategories: string[] = [];

  if (stats && stats.length > 0) {
    // Weakest categories get priority — take bottom 3
    const weakest = stats.slice(0, 3);
    targetCategories = weakest.map((s) => s.category);
    // Use the average Elo of the weakest categories
    targetElo = Math.round(
      weakest.reduce((sum, s) => sum + s.elo_rating, 0) / weakest.length
    );
  }

  // Query for Elo-matched questions in weak categories first
  const eloRange = 100; // look +/- 100 from target

  if (targetCategories.length > 0) {
    const { data: candidates } = await supabase
      .from("questions")
      .select("*")
      .in("category", targetCategories)
      .gte("difficulty_rating", targetElo - eloRange)
      .lte("difficulty_rating", targetElo + eloRange)
      .limit(50);

    if (candidates && candidates.length > 0) {
      // Filter out already answered
      const unseen = candidates.filter((q) => !answeredIds.has(q.id));
      if (unseen.length > 0) {
        // Random pick from unseen
        const pick = unseen[Math.floor(Math.random() * unseen.length)];
        return pick as Question;
      }
    }
  }

  // Fallback: any Elo-matched unseen question
  const { data: fallback } = await supabase
    .from("questions")
    .select("*")
    .gte("difficulty_rating", targetElo - eloRange)
    .lte("difficulty_rating", targetElo + eloRange)
    .limit(50);

  if (fallback && fallback.length > 0) {
    const unseen = fallback.filter((q) => !answeredIds.has(q.id));
    if (unseen.length > 0) {
      const pick = unseen[Math.floor(Math.random() * unseen.length)];
      return pick as Question;
    }
  }

  // Last resort: any question at all
  const { data: anyQuestion } = await supabase
    .from("questions")
    .select("*")
    .limit(50);

  if (anyQuestion && anyQuestion.length > 0) {
    const unseen = anyQuestion.filter((q) => !answeredIds.has(q.id));
    if (unseen.length > 0) {
      const pick = unseen[Math.floor(Math.random() * unseen.length)];
      return pick as Question;
    }
    // Even if all answered, return a random one for practice
    return anyQuestion[
      Math.floor(Math.random() * anyQuestion.length)
    ] as Question;
  }

  return null;
}
