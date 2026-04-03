import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function StudentDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch profile
  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // Fetch streak
  const { data: streak } = await supabase
    .from("streaks")
    .select("*")
    .eq("student_id", user.id)
    .single();

  // Fetch available time balance (non-expired, non-redeemed)
  const { data: balances } = await supabase
    .from("time_balances")
    .select("minutes_remaining, expires_at")
    .eq("student_id", user.id)
    .eq("redeemed", false)
    .gt("expires_at", new Date().toISOString())
    .gt("minutes_remaining", 0);

  const totalMinutes =
    balances?.reduce((sum, b) => sum + Number(b.minutes_remaining), 0) ?? 0;

  // Fetch today's sessions for progress
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todaySessions } = await supabase
    .from("sessions")
    .select("total_questions, correct_count, minutes_earned")
    .eq("student_id", user.id)
    .gte("started_at", todayStart.toISOString());

  const todayQuestions =
    todaySessions?.reduce((sum, s) => sum + s.total_questions, 0) ?? 0;
  const todayCorrect =
    todaySessions?.reduce((sum, s) => sum + s.correct_count, 0) ?? 0;
  const todayMinutes =
    todaySessions?.reduce((sum, s) => sum + Number(s.minutes_earned), 0) ?? 0;
  const todayAccuracy =
    todayQuestions > 0 ? Math.round((todayCorrect / todayQuestions) * 100) : 0;

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          Hey, {profile?.display_name ?? "Student"}
        </h2>
        <p className="text-gray-400">Ready to level up?</p>
      </div>

      {/* Gaming Time Balance — big hero card */}
      <div className="card-glow p-6 text-center">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Gaming Time Available
        </p>
        <p className="mt-2 text-5xl font-bold text-accent-blue">
          {totalMinutes}
          <span className="text-2xl text-gray-400 ml-1">min</span>
        </p>
        {balances && balances.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Earliest expiry:{" "}
            {new Date(balances[0].expires_at).toLocaleDateString()}
          </p>
        )}
        <Link
          href="/practice"
          className="btn-primary mt-4 w-full text-lg"
        >
          Start Practice
        </Link>
      </div>

      {/* Streak */}
      <div className="card-glass p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
            <svg
              className="h-6 w-6 text-accent-gold"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-white">
              {streak?.current_streak ?? 0} day streak
            </p>
            <p className="text-xs text-gray-400">
              Best: {streak?.longest_streak ?? 0} days
            </p>
          </div>
        </div>
        <div className="badge-gold text-sm">
          {(streak?.current_streak ?? 0) >= 7 ? "On Fire" : "Keep Going"}
        </div>
      </div>

      {/* Today's Progress */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Today&apos;s Progress
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card text-center">
            <span className="stat-value">{todayQuestions}</span>
            <span className="stat-label">Questions</span>
          </div>
          <div className="stat-card text-center">
            <span className="stat-value text-accent-green">
              {todayAccuracy}%
            </span>
            <span className="stat-label">Accuracy</span>
          </div>
          <div className="stat-card text-center">
            <span className="stat-value text-accent-blue">
              {todayMinutes}
            </span>
            <span className="stat-label">Min Earned</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/review" className="btn-secondary text-center text-sm">
          Review Mistakes
        </Link>
        <Link href="/leaderboard" className="btn-secondary text-center text-sm">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
