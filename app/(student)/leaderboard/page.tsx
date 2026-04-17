import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LeaderboardClient from "./LeaderboardClient";
import { effectiveStreak } from "@/lib/engine/streak";

export default async function LeaderboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: profile } = await admin.from("users").select("family_id").eq("id", user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: familyStudents } = await admin.from("users").select("id, display_name").eq("family_id", profile?.family_id ?? "").eq("role", "student");
  const studentIds = (familyStudents ?? []).map((s: { id: string }) => s.id);

  if (studentIds.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
        <div className="card-glass p-8 text-center">
          <p className="text-gray-400">No students in your family yet.</p>
        </div>
      </div>
    );
  }

  // Fetch all data needed for composite scoring
  const { data: streaks } = await admin.from("streaks").select("*").in("student_id", studentIds);
  const { data: allStats } = await admin.from("student_stats").select("*").in("student_id", studentIds);

  // All-time answers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allAnswers } = await admin.from("student_questions").select("student_id, is_correct, elo_before").in("student_id", studentIds);

  // Weekly answers (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: weekAnswers } = await admin.from("student_questions").select("student_id, is_correct, elo_before").in("student_id", studentIds).gte("answered_at", weekAgo.toISOString());

  // Build leaderboard data for each student
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const students = (familyStudents ?? []).map((s: any) => {
    const streak = (streaks ?? []).find((st: { student_id: string }) => st.student_id === s.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentStats = (allStats ?? []).filter((st: any) => st.student_id === s.id);
    const avgElo = studentStats.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? Math.round(studentStats.reduce((sum: number, st: any) => sum + st.elo_rating, 0) / studentStats.length)
      : 500;

    // All-time stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myAllAnswers = (allAnswers ?? []).filter((a: any) => a.student_id === s.id);
    const allTotal = myAllAnswers.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCorrect = myAllAnswers.filter((a: any) => a.is_correct).length;
    const allAccuracy = allTotal > 0 ? Math.round((allCorrect / allTotal) * 100) : 0;

    // Weekly stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myWeekAnswers = (weekAnswers ?? []).filter((a: any) => a.student_id === s.id);
    const weekTotal = myWeekAnswers.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekCorrect = myWeekAnswers.filter((a: any) => a.is_correct).length;
    const weekAccuracy = weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0;

    return {
      id: s.id,
      displayName: s.display_name,
      currentStreak: effectiveStreak(
        streak?.last_practice_date ?? null,
        streak?.current_streak ?? 0
      ),
      longestStreak: streak?.longest_streak ?? 0,
      avgElo,
      allTime: { total: allTotal, correct: allCorrect, accuracy: allAccuracy },
      weekly: { total: weekTotal, correct: weekCorrect, accuracy: weekAccuracy },
    };
  });

  return <LeaderboardClient students={students} currentUserId={user.id} />;
}
