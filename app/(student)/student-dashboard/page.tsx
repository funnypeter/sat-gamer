import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import CategoryBreakdown from "@/components/student/CategoryBreakdown";
import { effectiveStreak } from "@/lib/engine/streak";
import { formatMinutes } from "@/lib/constants";
import { VOCAB_TOTAL } from "@/lib/vocab/word-list";

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
  const displayStreak = effectiveStreak(
    streak?.last_practice_date ?? null,
    streak?.current_streak ?? 0
  );

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

  // Passage-practice sessions only. Vocabulary reps are counted separately
  // below — a 90%-accurate vocab session averaged into passage accuracy hides
  // exactly the weakness this dashboard exists to surface.
  const { data: todaySessions } = await admin
    .from("sessions")
    .select("total_questions, correct_count, minutes_earned")
    .eq("student_id", user.id)
    .eq("mode", "practice")
    .gte("started_at", todayStart.toISOString());

  const [{ data: vocabToday }, { data: vocabMastery }, { data: vocabMinutes }] =
    await Promise.all([
      admin
        .from("vocab_attempts")
        .select("is_correct")
        .eq("student_id", user.id)
        .gte("answered_at", todayStart.toISOString()),
      admin.from("vocab_mastery").select("mastered").eq("student_id", user.id),
      admin
        .from("sessions")
        .select("minutes_earned")
        .eq("student_id", user.id)
        .eq("mode", "vocab")
        .gte("started_at", todayStart.toISOString()),
    ]);

  const vocabTodayCount = vocabToday?.length ?? 0;
  const vocabTodayCorrect =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vocabToday?.filter((a: any) => a.is_correct).length ?? 0;
  const vocabMasteredCount =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vocabMastery?.filter((m: any) => m.mastered).length ?? 0;
  const vocabSeenCount = vocabMastery?.length ?? 0;
  const vocabMinutesToday =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vocabMinutes?.reduce((sum: number, s: any) => sum + Number(s.minutes_earned), 0) ?? 0;

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

  // Average answer time per category (same RPC the parent detail page uses)
  const { data: avgTimeRows } = await admin.rpc("avg_time_by_category", {
    p_student_id: user.id,
  });
  const avgTimes: Record<string, number> = {};
  let timedAttempts = 0;
  let timedTotalSeconds = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (avgTimeRows ?? []) as any[]) {
    avgTimes[row.category] = Number(row.avg_seconds);
    timedAttempts += Number(row.attempts);
    timedTotalSeconds += Number(row.avg_seconds) * Number(row.attempts);
  }
  const overallAvgSeconds =
    timedAttempts > 0 ? timedTotalSeconds / timedAttempts : null;

  const avgElo =
    categoryStats && categoryStats.length > 0
      ? Math.round(
          categoryStats.reduce(
            (sum: number, s: { elo_rating: number }) => sum + s.elo_rating,
            0
          ) / categoryStats.length
        )
      : 500;

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
          {formatMinutes(totalMinutes)}<span className="text-2xl text-gray-400 ml-1">min</span>
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
        <Link
          href="/vocab"
          className="mt-3 block rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-center text-sm font-semibold text-purple-300 transition-colors hover:bg-purple-500/20"
        >
          Drill Vocabulary
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card-glass p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/10">
              <svg className="h-5 w-5 text-accent-gold" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-white leading-tight">
                {displayStreak}
                <span className="text-sm font-medium text-gray-400 ml-1">
                  day{displayStreak === 1 ? "" : "s"}
                </span>
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {displayStreak >= 7 ? "On Fire" : "Keep Going"} · Best {streak?.longest_streak ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card-glass p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-blue/10">
              <svg className="h-5 w-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-white leading-tight">{avgElo}</p>
              <p className="text-[11px] text-gray-400 truncate">Avg Elo</p>
            </div>
          </div>
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
            <span className="stat-value text-accent-blue">
              {formatMinutes(todayMinutes + vocabMinutesToday)}
            </span>
            <span className="stat-label">Min Earned</span>
          </div>
        </div>
      </div>

      {/* Vocabulary — mastery against the fixed word list. Kept out of the
          Questions/Accuracy tiles above because vocab reps and passage
          questions aren't the same unit of work. */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Vocabulary</h3>
        <Link href="/vocab" className="block card-glass p-4 transition-colors hover:bg-white/[0.07]">
          <div className="flex items-baseline justify-between">
            <p className="text-xl font-bold text-white">
              {vocabMasteredCount}
              <span className="text-sm font-medium text-gray-400"> / {VOCAB_TOTAL} mastered</span>
            </p>
            {vocabTodayCount > 0 && (
              <p className="text-xs text-gray-400">
                {vocabTodayCorrect}/{vocabTodayCount} today
              </p>
            )}
          </div>
          <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-gold rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (vocabMasteredCount / VOCAB_TOTAL) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            {vocabSeenCount - vocabMasteredCount > 0
              ? `${vocabSeenCount - vocabMasteredCount} words in progress`
              : "Tap to start drilling"}
          </p>
        </Link>
      </div>

      {/* Category Breakdown — collapsed by default */}
      {categoryStats && categoryStats.length > 0 && (
        <CategoryBreakdown
          stats={categoryStats}
          avgTimes={avgTimes}
          overallAvgSeconds={overallAvgSeconds}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/review" className="btn-secondary text-center text-sm">Review Mistakes</Link>
        <Link href="/leaderboard" className="btn-secondary text-center text-sm">Leaderboard</Link>
      </div>
    </div>
  );
}
