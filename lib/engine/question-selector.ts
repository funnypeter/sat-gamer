import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/lib/types/database";

/**
 * Select the next question for a student.
 *
 * Priority:
 * 1. Spaced repetition items due today (any source)
 * 2. Elo-matched unseen College Board questions in the student's
 *    weakest categories
 * 3. Elo-matched unseen College Board questions in any category
 * 4. Elo-matched unseen questions of any source in weakest categories
 * 5. Elo-matched unseen questions of any source in any category
 * 6. Any unseen question at all (any difficulty, any source)
 * 7. Returns null so the caller can trigger Gemini generation
 *
 * Never returns a question already answered in the current session.
 *
 * The CB-first preference at steps 2-3 means a student is always
 * served authentic College Board content when an Elo-appropriate one
 * exists, before falling back to AI-generated material.
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

  const eloFilter = { eloMin: targetElo - eloRange, eloMax: targetElo + eloRange };

  // Build the cascade. Each tier tries CB first, then any source.
  // The earliest tier that returns a question wins.
  const tiers: Array<Parameters<typeof findUnseen>[3]> = [];
  if (targetCategories.length > 0) {
    tiers.push({ ...eloFilter, categories: targetCategories, cbOnly: true });
  }
  tiers.push({ ...eloFilter, cbOnly: true });
  if (targetCategories.length > 0) {
    tiers.push({ ...eloFilter, categories: targetCategories });
  }
  tiers.push({ ...eloFilter });
  tiers.push({}); // last resort: any unseen question at any difficulty

  for (const filters of tiers) {
    const q = await findUnseen(supabase, answeredIds, sessionAnsweredIds, filters);
    if (q) return q;
  }

  // All questions exhausted — return null so caller triggers generation
  return null;
}

async function findUnseen(
  supabase: SupabaseClient,
  answeredIds: Set<string>,
  sessionAnsweredIds: Set<string>,
  filters: {
    categories?: string[];
    eloMin?: number;
    eloMax?: number;
    /** When true, restrict to authentic College Board questions. */
    cbOnly?: boolean;
  }
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
  if (filters.cbOnly) {
    // Match both the canonical "collegeboard" tag and any classified
    // variant the importer might emit in the future.
    query = query.or(
      "generated_by.eq.collegeboard,generated_by.eq.collegeboard-classified"
    );
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
