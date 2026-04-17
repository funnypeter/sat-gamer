import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveStreak } from "@/lib/engine/streak";

/**
 * Shape consumed by `LeaderboardClient`. One entry per student in the family.
 * `avgElo` is the arithmetic mean across categories (fallback 500 if the
 * student has no stats rows yet).
 */
export interface LeaderboardStudent {
  id: string;
  displayName: string;
  currentStreak: number;
  longestStreak: number;
  avgElo: number;
  allTime: { total: number; correct: number; accuracy: number };
  weekly: { total: number; correct: number; accuracy: number };
}

/**
 * Fetch and assemble leaderboard rows for a set of students. Shared by the
 * student-facing leaderboard page and the parent dashboard so both views
 * rank identically. Does its own queries rather than accepting pre-fetched
 * data, so the parent dashboard doesn't have to duplicate fetches.
 */
export async function buildLeaderboard(
  admin: SupabaseClient,
  familyStudents: Array<{ id: string; display_name: string }>
): Promise<LeaderboardStudent[]> {
  const studentIds = familyStudents.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const [
    { data: streaks },
    { data: allStats },
    { data: allAnswers },
    { data: weekAnswers },
  ] = await Promise.all([
    admin.from("streaks").select("*").in("student_id", studentIds),
    admin.from("student_stats").select("*").in("student_id", studentIds),
    admin
      .from("student_questions")
      .select("student_id, is_correct")
      .in("student_id", studentIds),
    (() => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return admin
        .from("student_questions")
        .select("student_id, is_correct")
        .in("student_id", studentIds)
        .gte("answered_at", weekAgo.toISOString());
    })(),
  ]);

  return familyStudents.map((s) => {
    const streak = (streaks ?? []).find(
      (st: { student_id: string }) => st.student_id === s.id
    );
    const studentStats = (allStats ?? []).filter(
      (st: { student_id: string }) => st.student_id === s.id
    );
    const avgElo =
      studentStats.length > 0
        ? Math.round(
            studentStats.reduce(
              (sum: number, st: { elo_rating: number }) => sum + st.elo_rating,
              0
            ) / studentStats.length
          )
        : 500;

    const myAll = (allAnswers ?? []).filter(
      (a: { student_id: string }) => a.student_id === s.id
    );
    const allTotal = myAll.length;
    const allCorrect = myAll.filter(
      (a: { is_correct: boolean }) => a.is_correct
    ).length;

    const myWeek = (weekAnswers ?? []).filter(
      (a: { student_id: string }) => a.student_id === s.id
    );
    const weekTotal = myWeek.length;
    const weekCorrect = myWeek.filter(
      (a: { is_correct: boolean }) => a.is_correct
    ).length;

    return {
      id: s.id,
      displayName: s.display_name,
      currentStreak: effectiveStreak(
        streak?.last_practice_date ?? null,
        streak?.current_streak ?? 0
      ),
      longestStreak: streak?.longest_streak ?? 0,
      avgElo,
      allTime: {
        total: allTotal,
        correct: allCorrect,
        accuracy: allTotal > 0 ? Math.round((allCorrect / allTotal) * 100) : 0,
      },
      weekly: {
        total: weekTotal,
        correct: weekCorrect,
        accuracy:
          weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0,
      },
    };
  });
}
