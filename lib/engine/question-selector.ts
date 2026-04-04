import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/lib/types/database";

/**
 * Select the next question for a student.
 *
 * Priority:
 * 1. Spaced repetition items due today
 * 2. Elo-matched unseen questions weighted toward weakest categories
 * 3. If pool is low, returns null so the caller can trigger generation
 *
 * Never returns a question already answered in the current session.
 */
export async function selectNextQuestion(
  supabase: SupabaseClient,
  studentId: string,
  currentSessionId?: string
): Promise<Question | null> {
  // Get ALL question IDs this student has ever answered
  const { data: answered } = await supabase
    .from("student_questions")
    .select("question_id")
    .eq("student_id", studentId);

  const answeredIds = new Set((answered ?? []).map((a: { question_id: string }) => a.question_id));

  // Also get questions answered in THIS session (to avoid repeats within a session)
  let sessionAnsweredIds = new Set<string>();
  if (currentSessionId) {
    const { data: sessionAnswered } = await supabase
      .from("student_questions")
      .select("question_id")
      .eq("session_id", currentSessionId);
    sessionAnsweredIds = new Set((sessionAnswered ?? []).map((a: { question_id: string }) => a.question_id));
  }

  // 1. Check for spaced repetition items due today
  const today = new Date().toISOString().split("T")[0];
  const { data: srItems } = await supabase
    .from("spaced_repetition")
    .select("question_id")
    .eq("student_id", studentId)
    .lte("next_review_date", today)
    .order("next_review_date", { ascending: true })
    .limit(5);

  if (srItems && srItems.length > 0) {
    // Pick one not answered this session
    for (const sr of srItems) {
      if (!sessionAnsweredIds.has(sr.question_id)) {
        const { data: question } = await supabase
          .from("questions")
          .select("*")
          .eq("id", sr.question_id)
          .single();
        if (question) return question as Question;
      }
    }
  }

  // 2. Get student stats to find weakest categories
  const { data: stats } = await supabase
    .from("student_stats")
    .select("*")
    .eq("student_id", studentId)
    .order("elo_rating", { ascending: true });

  let targetElo = 500;
  let targetCategories: string[] = [];

  if (stats && stats.length > 0) {
    const weakest = stats.slice(0, 3);
    targetCategories = weakest.map((s: { category: string }) => s.category);
    targetElo = Math.round(
      weakest.reduce((sum: number, s: { elo_rating: number }) => sum + s.elo_rating, 0) / weakest.length
    );
  }

  const eloRange = 150; // wider range to find more candidates

  // Try weak categories first
  if (targetCategories.length > 0) {
    const question = await findUnseen(supabase, answeredIds, sessionAnsweredIds, {
      categories: targetCategories,
      eloMin: targetElo - eloRange,
      eloMax: targetElo + eloRange,
    });
    if (question) return question;
  }

  // Try any category in Elo range
  const question = await findUnseen(supabase, answeredIds, sessionAnsweredIds, {
    eloMin: targetElo - eloRange,
    eloMax: targetElo + eloRange,
  });
  if (question) return question;

  // Try any unseen question at all (any difficulty)
  const anyQuestion = await findUnseen(supabase, answeredIds, sessionAnsweredIds, {});
  if (anyQuestion) return anyQuestion;

  // All questions exhausted — return null so caller triggers generation
  return null;
}

async function findUnseen(
  supabase: SupabaseClient,
  answeredIds: Set<string>,
  sessionAnsweredIds: Set<string>,
  filters: { categories?: string[]; eloMin?: number; eloMax?: number }
): Promise<Question | null> {
  let query = supabase.from("questions").select("*").limit(100);

  if (filters.categories && filters.categories.length > 0) {
    query = query.in("category", filters.categories);
  }
  if (filters.eloMin !== undefined) {
    query = query.gte("difficulty_rating", filters.eloMin);
  }
  if (filters.eloMax !== undefined) {
    query = query.lte("difficulty_rating", filters.eloMax);
  }

  const { data: candidates } = await query;
  if (!candidates || candidates.length === 0) return null;

  // Prefer never-answered, then not-answered-this-session
  const neverSeen = candidates.filter((q: { id: string }) => !answeredIds.has(q.id));
  if (neverSeen.length > 0) {
    return neverSeen[Math.floor(Math.random() * neverSeen.length)] as Question;
  }

  const notThisSession = candidates.filter((q: { id: string }) => !sessionAnsweredIds.has(q.id));
  if (notThisSession.length > 0) {
    return notThisSession[Math.floor(Math.random() * notThisSession.length)] as Question;
  }

  return null;
}
