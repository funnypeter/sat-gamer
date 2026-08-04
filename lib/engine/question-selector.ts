import type { SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/lib/types/database";
import { DSAT_CATEGORIES, type DsatCategory } from "@/lib/constants";

interface CategoryStat {
  category: string;
  elo_rating: number;
  total_attempted: number;
}

/**
 * Pick the category for the next question, uniformly at random across
 * all ten DSAT categories.
 *
 * This deliberately does *not* target weak categories. Weighting toward
 * the categories a student misses most concentrates practice on three
 * of ten skills and leaves the rest barely drilled — the student meets
 * Cross-Text Connections a handful of times in a month because they
 * happen to be decent at it. The test scores all ten, so coverage beats
 * remediation: every category comes up equally often, and difficulty
 * targeting (the Elo band, which is still per-category) is what adapts
 * to how the student is doing.
 *
 * Missed questions still come back — via spaced repetition, which is
 * tier 1 of the cascade and unaffected by this.
 */
export function pickTargetCategory(): DsatCategory {
  return DSAT_CATEGORIES[Math.floor(Math.random() * DSAT_CATEGORIES.length)];
}

/**
 * Select the next question for a student.
 *
 * Priority:
 * 1. Spaced repetition items due today (any source)
 * 2. Elo-matched CB question in a randomly chosen category, at *that
 *    category's* own Elo ±150
 * 3. Elo-matched any-source question in that same random category
 * 4. Elo-matched CB question in any category at the overall Elo ±150
 * 5. Elo-matched any-source question in any category
 * 6. Any unseen question at all (any difficulty, any source)
 * 7. Returns null so the caller can trigger Gemini generation
 *
 * Only never-answered questions are served. Questions the student has
 * already answered (right or wrong) come back solely via spaced
 * repetition (step 1) — or via the explicit { allowRepeats: true }
 * option, which the /api/questions/next route uses only after Gemini
 * generation has failed, as a better-than-nothing fallback. Repeats
 * within the current session are never served.
 *
 * The CB-first preference at steps 2 and 4 means a student is always
 * served authentic College Board content when an Elo-appropriate one
 * exists, before falling back to AI-generated material.
 *
 * **Category is random, not weakness-weighted** (see
 * pickTargetCategory). Steps 2-3 re-roll per question, so over a
 * session all ten categories come up in roughly equal measure. Elo is
 * still per-category and still sets the difficulty window, so the
 * *level* adapts even though the *topic* doesn't.
 */
export async function selectNextQuestion(
  supabase: SupabaseClient,
  studentId: string,
  currentSessionId?: string,
  opts?: { allowRepeats?: boolean }
): Promise<Question | null> {
  // Get ALL question IDs this student has ever answered. Paged: PostgREST
  // caps any single response at 1000 rows, and an active student crosses
  // that after a few months — unpaged, older answers silently drop out of
  // the exclusion set and start getting re-served.
  const answeredIds = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page } = await supabase
      .from("student_questions")
      .select("question_id")
      .eq("student_id", studentId)
      .range(from, from + PAGE - 1);
    for (const a of page ?? []) answeredIds.add(a.question_id);
    if (!page || page.length < PAGE) break;
  }

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

  // 2. Get student stats — used only for difficulty targeting now, not
  //    for choosing which category to serve.
  const { data: stats } = await supabase
    .from("student_stats")
    .select("category, elo_rating, total_attempted")
    .eq("student_id", studentId)
    .order("elo_rating", { ascending: true });

  const eloRange = 150; // wider range to find more candidates

  // Overall average Elo centres the difficulty window for the
  // any-category fallback tiers.
  let avgElo = 500;
  if (stats && stats.length > 0) {
    avgElo = Math.round(
      (stats as CategoryStat[]).reduce((sum, s) => sum + s.elo_rating, 0) /
        stats.length
    );
  }

  // Roll a category for this question. Uniform across all ten, so
  // coverage is even; the band below is what adapts to skill.
  const targetCategory = pickTargetCategory();
  const targetStat = (stats as CategoryStat[] | null)?.find(
    (s) => s.category === targetCategory
  );
  // No stats row yet means the student has never attempted this
  // category — the whole point of rolling randomly. Centre on the
  // overall average until it has a rating of its own.
  const targetElo = targetStat?.elo_rating ?? avgElo;

  // Build the cascade. Each tier tries CB first, then any source.
  // The earliest tier that returns a question wins.
  const tiers: Array<Parameters<typeof findUnseen>[3]> = [];

  // 2. Rolled category at its own Elo, CB-first
  tiers.push({
    eloMin: targetElo - eloRange,
    eloMax: targetElo + eloRange,
    categories: [targetCategory],
    cbOnly: true,
  });

  // 3. Rolled category, any source — exhaust the topic before widening
  tiers.push({
    eloMin: targetElo - eloRange,
    eloMax: targetElo + eloRange,
    categories: [targetCategory],
  });

  // 4. CB any category at overall Elo
  tiers.push({
    eloMin: avgElo - eloRange,
    eloMax: avgElo + eloRange,
    cbOnly: true,
  });

  // 5. Any source any category at overall Elo
  tiers.push({
    eloMin: avgElo - eloRange,
    eloMax: avgElo + eloRange,
  });

  // 6. Last resort: any unseen question at any difficulty
  tiers.push({});

  for (const filters of tiers) {
    const q = await findUnseen(supabase, answeredIds, sessionAnsweredIds, filters);
    if (q) return q;
  }

  // Every question has been seen. Normally return null so the caller
  // triggers Gemini generation; only when the caller explicitly opts in
  // (generation already failed) do we re-serve an old question.
  if (opts?.allowRepeats) {
    for (const filters of tiers) {
      const q = await findUnseen(
        supabase,
        answeredIds,
        sessionAnsweredIds,
        filters,
        true
      );
      if (q) return q;
    }
  }

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
  },
  /**
   * When true, serve already-answered questions (still never repeats
   * within the current session). Off by default: silently re-serving
   * answered questions here would mask unseen questions in later tiers
   * and starve the Gemini-generation fallback.
   */
  allowAnswered = false
): Promise<Question | null> {
  // Fetch ids only so the candidate window can be wide without
  // shipping hundreds of passages over the wire; the winner's full row
  // is fetched afterwards. Paged past PostgREST's 1000-row cap so wide
  // tiers (e.g. the no-filter last resort) see the whole pool — an
  // unpaged fetch would only ever expose the same first 1000 rows.
  const candidates: Array<{ id: string }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("questions")
      .select("id")
      .order("id")
      .range(from, from + PAGE - 1);

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

    const { data: page } = await query;
    candidates.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }
  if (candidates.length === 0) return null;

  const pool = candidates.filter((q: { id: string }) =>
    allowAnswered ? !sessionAnsweredIds.has(q.id) : !answeredIds.has(q.id)
  );
  if (pool.length === 0) return null;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  const { data: question } = await supabase
    .from("questions")
    .select("*")
    .eq("id", picked.id)
    .single();
  return (question as Question) ?? null;
}
