import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateStreak } from "@/lib/engine/streak";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId } = body as { sessionId: string };

    // Finalize the session
    const { data: session } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("student_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "active") {
      return NextResponse.json(
        { error: "Session is not active" },
        { status: 400 }
      );
    }

    // Update session to completed
    await supabase
      .from("sessions")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        accuracy:
          session.total_questions > 0
            ? Math.round(
                (session.correct_count / session.total_questions) * 100
              )
            : null,
      })
      .eq("id", sessionId);

    // Update streak (only if they answered at least 1 question)
    if (session.total_questions > 0) {
      const { data: currentStreak } = await supabase
        .from("streaks")
        .select("*")
        .eq("student_id", user.id)
        .single();

      const streakResult = updateStreak(
        currentStreak?.last_practice_date ?? null,
        currentStreak?.current_streak ?? 0,
        currentStreak?.longest_streak ?? 0
      );

      const todayStr = new Date().toISOString().split("T")[0];

      if (currentStreak) {
        await supabase
          .from("streaks")
          .update({
            current_streak: streakResult.newStreak,
            longest_streak: streakResult.newLongestStreak,
            last_practice_date: todayStr,
          })
          .eq("student_id", user.id);
      } else {
        await supabase.from("streaks").insert({
          student_id: user.id,
          current_streak: streakResult.newStreak,
          longest_streak: streakResult.newLongestStreak,
          last_practice_date: todayStr,
        });
      }

      // Award bonus minutes for streak milestones
      if (streakResult.bonusMinutes > 0) {
        await supabase.from("time_balances").insert({
          student_id: user.id,
          session_id: sessionId,
          minutes_earned: streakResult.bonusMinutes,
          minutes_remaining: streakResult.bonusMinutes,
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        });

        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "streak_milestone",
          title: "Streak Milestone!",
          message: `${streakResult.newStreak}-day streak! You earned ${streakResult.bonusMinutes} bonus minutes!`,
          data: {
            streak: streakResult.newStreak,
            bonus: streakResult.bonusMinutes,
          },
        });
      }

      return NextResponse.json({
        success: true,
        streak: streakResult.newStreak,
        bonusMinutes: streakResult.bonusMinutes,
      });
    }

    return NextResponse.json({ success: true, streak: 0, bonusMinutes: 0 });
  } catch (err) {
    console.error("Session end error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
