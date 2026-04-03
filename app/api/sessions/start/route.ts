import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for any active sessions — abandon them first
    const { data: activeSessions } = await supabase
      .from("sessions")
      .select("id, block_seconds")
      .eq("student_id", user.id)
      .eq("status", "active");

    if (activeSessions && activeSessions.length > 0) {
      // Mark previous active sessions as abandoned
      for (const session of activeSessions) {
        await supabase
          .from("sessions")
          .update({ status: "abandoned", ended_at: new Date().toISOString() })
          .eq("id", session.id);
      }
    }

    // Get the most recent completed session's block_seconds for continuity
    const { data: lastSession } = await supabase
      .from("sessions")
      .select("block_seconds")
      .eq("student_id", user.id)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(1)
      .single();

    // Create new session
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        student_id: user.id,
        total_questions: 0,
        correct_count: 0,
        minutes_earned: 0,
        block_seconds: 0,
        status: "active",
      })
      .select()
      .single();

    if (error || !session) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    // Get today's earned minutes for cap tracking
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayBalances } = await supabase
      .from("time_balances")
      .select("minutes_earned")
      .eq("student_id", user.id)
      .gte("earned_at", todayStart.toISOString());

    const minutesEarnedToday =
      todayBalances?.reduce((sum, b) => sum + Number(b.minutes_earned), 0) ?? 0;

    return NextResponse.json({
      sessionId: session.id,
      previousBlockSeconds: lastSession?.block_seconds ?? 0,
      minutesEarnedToday,
    });
  } catch (err) {
    console.error("Session start error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
