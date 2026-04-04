import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Abandon any active sessions
    const { data: activeSessions } = await admin
      .from("sessions")
      .select("id")
      .eq("student_id", user.id)
      .eq("status", "active");

    if (activeSessions && activeSessions.length > 0) {
      for (const session of activeSessions) {
        await admin
          .from("sessions")
          .update({ status: "abandoned", ended_at: new Date().toISOString() })
          .eq("id", session.id);
      }
    }

    // Get previous session's block_seconds for continuity
    const { data: lastSession } = await admin
      .from("sessions")
      .select("block_seconds")
      .eq("student_id", user.id)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(1)
      .single();

    // Create new session
    const { data: session, error } = await admin
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
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Today's earned minutes for cap tracking
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayBalances } = await admin
      .from("time_balances")
      .select("minutes_earned")
      .eq("student_id", user.id)
      .gte("earned_at", todayStart.toISOString());

    const minutesEarnedToday =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      todayBalances?.reduce((sum: number, b: any) => sum + Number(b.minutes_earned), 0) ?? 0;

    return NextResponse.json({
      sessionId: session.id,
      previousBlockSeconds: lastSession?.block_seconds ?? 0,
      minutesEarnedToday,
    });
  } catch (err) {
    console.error("Session start error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
