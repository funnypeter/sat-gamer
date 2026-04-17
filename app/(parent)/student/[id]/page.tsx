import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DSAT_CATEGORIES } from "@/lib/constants";
import Link from "next/link";
import ResetStudentButton from "@/components/parent/ResetStudentButton";
import { effectiveStreak } from "@/lib/engine/streak";

interface WeekData {
  weekLabel: string;
  questionsAnswered: number;
  accuracy: number;
}

export default async function StudentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Verify caller is a parent in the same family
  const { data: parentProfile } = await admin
    .from("users")
    .select("role, family_id")
    .eq("id", user.id)
    .single();

  if (!parentProfile || parentProfile.role !== "parent") redirect("/login");

  // Fetch student profile
  const { data: student } = await admin
    .from("users")
    .select("*")
    .eq("id", params.id)
    .eq("family_id", parentProfile.family_id)
    .eq("role", "student")
    .single();

  if (!student) redirect("/parent-dashboard");

  // Fetch all data in parallel
  const [
    { data: stats },
    { data: streak },
    { data: recentAnswers },
  ] = await Promise.all([
    admin
      .from("student_stats")
      .select("*")
      .eq("student_id", params.id),
    admin
      .from("streaks")
      .select("*")
      .eq("student_id", params.id)
      .single(),
    admin
      .from("student_questions")
      .select("*, questions(category)")
      .eq("student_id", params.id)
      .order("answered_at", { ascending: false })
      .limit(10),
  ]);

  // Overall stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalAttempted = (stats ?? []).reduce((sum: number, s: any) => sum + Number(s.total_attempted || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCorrect = (stats ?? []).reduce((sum: number, s: any) => sum + Number(s.total_correct || 0), 0);
  const overallAccuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avgElo = (stats ?? []).length > 0 ? Math.round((stats ?? []).reduce((sum: number, s: any) => sum + Number(s.elo_rating || 500), 0) / (stats ?? []).length) : 500;

  // Full category breakdown
  const categoryBreakdown = DSAT_CATEGORIES.map((cat) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stat = (stats ?? []).find((s: any) => s.category === cat);
    const attempted = stat ? Number(stat.total_attempted) : 0;
    const correct = stat ? Number(stat.total_correct) : 0;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return {
      category: cat,
      accuracy,
      eloRating: stat ? Number(stat.elo_rating) : 500,
      attempted,
    };
  });

  // Weekly trend: last 4 weeks
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  fourWeeksAgo.setHours(0, 0, 0, 0);

  const { data: weeklyRaw } = await admin
    .from("student_questions")
    .select("answered_at, is_correct")
    .eq("student_id", params.id)
    .gte("answered_at", fourWeeksAgo.toISOString())
    .order("answered_at", { ascending: true });

  // Group by week
  const weeklyTrend: WeekData[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekStartDate = new Date();
    weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay() - i * 7);
    weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekQuestions = (weeklyRaw ?? []).filter((q: any) => {
      const d = new Date(q.answered_at);
      return d >= weekStartDate && d < weekEndDate;
    });

    const wTotal = weekQuestions.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wCorrect = weekQuestions.filter((q: any) => q.is_correct).length;
    const monthDay = `${weekStartDate.getMonth() + 1}/${weekStartDate.getDate()}`;

    weeklyTrend.push({
      weekLabel: i === 0 ? "This Week" : i === 1 ? "Last Week" : `Wk of ${monthDay}`,
      questionsAnswered: wTotal,
      accuracy: wTotal > 0 ? Math.round((wCorrect / wTotal) * 100) : 0,
    });
  }

  // Recent activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentActivity = (recentAnswers ?? []).map((a: any) => ({
    id: a.id,
    isCorrect: a.is_correct,
    category: a.questions?.category ?? "Unknown",
    timeSpent: Number(a.time_spent_seconds || 0),
    answeredAt: a.answered_at,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back link */}
      <Link
        href="/parent-dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="card-glow p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-blue/10 text-accent-blue text-xl font-bold">
            {student.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{student.display_name}</h2>
            <p className="text-sm text-gray-400">Student Profile</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className="text-2xl font-bold text-white">{totalAttempted}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Questions</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className={`text-2xl font-bold ${overallAccuracy >= 70 ? "text-accent-green" : overallAccuracy >= 50 ? "text-accent-gold" : "text-accent-red"}`}>
              {overallAccuracy}%
            </p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Accuracy</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className="text-2xl font-bold text-purple-400">{avgElo}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Elo</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <div className="flex items-center justify-center gap-1">
              <svg className="h-5 w-5 text-accent-gold" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
              </svg>
              <p className="text-2xl font-bold text-accent-gold">{effectiveStreak(streak?.last_practice_date ?? null, streak?.current_streak ?? 0)}</p>
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Streak</p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Category Breakdown</h3>
        <div className="card-glow p-5 space-y-3">
          {categoryBreakdown.map((cat) => (
            <div key={cat.category} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300 truncate mr-4">{cat.category}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500">{cat.attempted} Qs</span>
                  <span className="text-xs text-purple-400">Elo {cat.eloRating}</span>
                  <span className={`font-medium min-w-[3ch] text-right ${cat.accuracy >= 70 ? "text-accent-green" : cat.accuracy >= 50 ? "text-accent-gold" : cat.attempted === 0 ? "text-gray-500" : "text-accent-red"}`}>
                    {cat.attempted > 0 ? `${cat.accuracy}%` : "--"}
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${cat.accuracy >= 70 ? "bg-accent-green" : cat.accuracy >= 50 ? "bg-accent-gold" : cat.attempted === 0 ? "bg-gray-700" : "bg-accent-red"}`}
                  style={{ width: `${cat.attempted > 0 ? cat.accuracy : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Trend */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Weekly Trend</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {weeklyTrend.map((week) => (
            <div key={week.weekLabel} className="card-glow p-4 text-center space-y-2">
              <p className="text-xs text-gray-400 font-medium">{week.weekLabel}</p>
              <p className="text-xl font-bold text-white">{week.questionsAnswered}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Questions</p>
              <p className={`text-sm font-medium ${week.accuracy >= 70 ? "text-accent-green" : week.accuracy >= 50 ? "text-accent-gold" : week.questionsAnswered === 0 ? "text-gray-500" : "text-accent-red"}`}>
                {week.questionsAnswered > 0 ? `${week.accuracy}% acc` : "--"}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div className="card-glass p-8 text-center">
            <p className="text-gray-400">No recent activity.</p>
          </div>
        ) : (
          <div className="card-glow divide-y divide-white/5">
            {recentActivity.map((activity) => {
              const timeAgo = getTimeAgo(activity.answeredAt);
              return (
                <div key={activity.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${activity.isCorrect ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}>
                      {activity.isCorrect ? "\u2713" : "\u2717"}
                    </div>
                    <div>
                      <p className="text-sm text-gray-300">{activity.category}</p>
                      <p className="text-xs text-gray-500">{timeAgo}</p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {activity.timeSpent}s
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="border border-accent-red/20 rounded-xl p-6 space-y-3">
        <h3 className="text-lg font-semibold text-accent-red">Danger Zone</h3>
        <p className="text-sm text-gray-400">
          Permanently delete all of {student.display_name}&apos;s practice history, earned time, and stats.
          This action cannot be undone.
        </p>
        <ResetStudentButton
          studentId={params.id}
          studentName={student.display_name}
        />
      </section>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
