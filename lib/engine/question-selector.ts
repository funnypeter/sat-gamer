import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/lib/types/database";

interface LaggardStat {
  category: string;
  elo_rating: number;
  total_attempted: number;
}

/**
 * Pick a single laggard category from the bottom 3 by Elo, weighted by
 * how far behind it is and how few attempts it has. A category at Elo
 * 612 with 4 attempts beats one at Elo 800 with 30 attempts — that
 * stops a low-Elo / small-history category (e.g. CoE Quantitative with
 * 4 questions) from being crowded out when the selector samples
 * uniformly across a multi-category candidate pool.
 *
 * Returns null when there are no stats yet (new student).
 */
export function pickLaggardCategory(stats: LaggardStat[]): string | null {
  if (stats.length === 0) return null;
  const sorted = [...stats].sort((a, b) => a.elo_rating - b.elo_rating);
  const candidates = sorted.slice(0, 3);

  const weights = candidates.map(
    (s) =>
      Math.max(1, 900 - s.elo_rating) +
      Math.max(0, 20 - s.total_attempted) * 10
  );
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return candidates[0].category;

  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].category;
  }
  return candidates[candidates.length - 1].category;
}

/**
 * Select the next question for a student.
 *
 * Priority:
 * 1. Spaced repetition items due today (any source)
 * 2. Elo-matched CB question in the single laggard category chosen by
 *    pickLaggardCategory(), at *that category's* own Elo ±150
 * 3. Elo-matched CB question in the bottom 3 weakest categories at
 *    average-of-bottom-3 Elo ±150 (broader fallback when the laggard
 *    pool is depleted)
 * 4. Elo-matched CB question in any category at the same band
 * 5. Elo-matched any-source question in the bottom 3 categories
 * 6. Elo-matched any-source question in any category
 * 7. Any unseen question at all (any difficulty, any source)
 * 8. Returns null so the caller can trigger Gemini generation
 *
 * Never returns a question already answered in the current session.
 *
 * The CB-first preference at steps 2-4 means a student is always
 * served authentic College Board content when an Elo-appropriate one
 * exists, before falling back to AI-generated material. Step 2's
 * single-category targeting is what equalizes Elo across categories
 * over time — without it, multi-category sampling lets large-pool
 * categories (Inferences, Central Ideas) starve small-pool laggards
 * (CoE Quantitative).
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
    .select("category, elo_rating, total_attempted")
    .eq("student_id", studentId)
    .order("elo_rating", { ascending: true });

  const eloRange = 150; // wider range to find more candidates

  // Bottom-3 average is used as the broader fallback target.
  let avgWeakElo = 500;
  let weakCategoryNames: string[] = [];
  if (stats && stats.length > 0) {
    const weakest = stats.slice(0, 3);
    weakCategoryNames = weakest.map((s: { category: string }) => s.category);
    avgWeakElo = Math.round(
      weakest.reduce(
        (sum: number, s: { elo_rating: number }) => sum + s.elo_rating,
        0
      ) / weakest.length
    );
  }

  // Pick a single laggard for the first tier so it doesn't get
  // out-sampled by larger sibling pools.
  const chosenLaggard = pickLaggardCategory((stats ?? []) as LaggardStat[]);
  const chosenStat = chosenLaggard
    ? (stats as LaggardStat[]).find((s) => s.category === chosenLaggard)
    : null;

  // Build the cascade. Each tier tries CB first, then any source.
  // The earliest tier that returns a question wins.
  const tiers: Array<Parameters<typeof findUnseen>[3]> = [];

  // 2a. Single laggard at its OWN Elo, CB-first
  if (chosenStat) {
    tiers.push({
      eloMin: chosenStat.elo_rating - eloRange,
      eloMax: chosenStat.elo_rating + eloRange,
      categories: [chosenStat.category],
      cbOnly: true,
    });
  }

  // 2b. Bottom 3 at avg Elo, CB-first (broader pool when 2a misses)
  if (weakCategoryNames.length > 0) {
    tiers.push({
      eloMin: avgWeakElo - eloRange,
      eloMax: avgWeakElo + eloRange,
      categories: weakCategoryNames,
      cbOnly: true,
    });
  }

  // 3. CB any category at avg Elo
  tiers.push({
    eloMin: avgWeakElo - eloRange,
    eloMax: avgWeakElo + eloRange,
    cbOnly: true,
  });

  // 4. Any source in bottom 3 at avg Elo
  if (weakCategoryNames.length > 0) {
    tiers.push({
      eloMin: avgWeakElo - eloRange,
      eloMax: avgWeakElo + eloRange,
      categories: weakCategoryNames,
    });
  }

  // 5. Any source any category at avg Elo
  tiers.push({
    eloMin: avgWeakElo - eloRange,
    eloMax: avgWeakElo + eloRange,
  });

  // 6. Last resort: any unseen question at any difficulty
  tiers.push({});

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
