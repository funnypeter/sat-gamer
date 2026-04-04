import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import CategoryBreakdown from "@/components/student/CategoryBreakdown";

export default async function StudentDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await admin
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: streak } = await admin
    .from("streaks")
    .select("*")
    .eq("student_id", user.id)
    .single();

  const { data: balances } = await admin
    .from("time_balances")
    .select("minutes_remaining, expires_at")
    .eq("student_id", user.id)
    .eq("redeemed", false)
    .gt("expires_at", new Date().toISOString())
    .gt("minutes_remaining", 0);

  const totalMinutes =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    balances?.reduce((sum: number, b: any) => sum + Number(b.minutes_remaining), 0) ?? 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todaySessions } = await admin
    .from("sessions")
    .select("total_questions, correct_count, minutes_earned")
    .eq("student_id", user.id)
    .gte("started_at", todayStart.toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayQuestions = todaySessions?.reduce((sum: number, s: any) => sum + s.total_questions, 0) ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayCorrect = todaySessions?.reduce((sum: number, s: any) => sum + s.correct_count, 0) ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayMinutes = todaySessions?.reduce((sum: number, s: any) => sum + Number(s.minutes_earned), 0) ?? 0;
  const todayAccuracy = todayQuestions > 0 ? Math.round((todayCorrect / todayQuestions) * 100) : 0;

  // Category breakdown
  const { data: categoryStats } = await admin
    .from("student_stats")
    .select("category, elo_rating, total_attempted, total_correct")
    .eq("student_id", user.id)
    .order("elo_rating", { ascending: true });

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">
          Hey, {profile?.display_name ?? "Student"}
        </h2>
        <p className="text-gray-400">Ready to level up?</p>
      </div>

      <div className="card-glow p-6 text-center">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Gaming Time Available</p>
        <p className="mt-2 text-5xl font-bold text-accent-blue">
          {totalMinutes}<span className="text-2xl text-gray-400 ml-1">min</span>
        </p>
        {balances && balances.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Earliest expiry: {new Date((balances[0] as { expires_at: string }).expires_at).toLocaleDateString()}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/practice" className="btn-primary text-center text-lg">
            Practice
          </Link>
          <Link href="/redeem" className="btn-secondary text-center text-lg border border-accent-gold/30 text-accent-gold hover:bg-accent-gold/10">
            Redeem Time
          </Link>
        </div>
      </div>

      <div className="card-glass p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
            <svg className="h-6 w-6 text-accent-gold" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{streak?.current_streak ?? 0} day streak</p>
            <p className="text-xs text-gray-400">Best: {streak?.longest_streak ?? 0} days</p>
          </div>
        </div>
        <div className="badge-gold text-sm">
          {(streak?.current_streak ?? 0) >= 7 ? "On Fire" : "Keep Going"}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Today&apos;s Progress</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card text-center">
            <span className="stat-value">{todayQuestions}</span>
            <span className="stat-label">Questions</span>
          </div>
          <div className="stat-card text-center">
            <span className="stat-value text-accent-green">{todayAccuracy}%</span>
            <span className="stat-label">Accuracy</span>
          </div>
          <div className="stat-card text-center">
            <span className="stat-value text-accent-blue">{todayMinutes}</span>
            <span className="stat-label">Min Earned</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown — collapsed by default */}
      {categoryStats && categoryStats.length > 0 && (
        <CategoryBreakdown stats={categoryStats} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/review" className="btn-secondary text-center text-sm">Review Mistakes</Link>
        <Link href="/leaderboard" className="btn-secondary text-center text-sm">Leaderboard</Link>
      </div>
    </div>
  );
}
