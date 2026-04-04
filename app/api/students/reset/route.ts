import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Verify caller is a parent
    const { data: parentProfile } = await adminClient
      .from("users")
      .select("role, family_id")
      .eq("id", user.id)
      .single();

    if (!parentProfile || parentProfile.role !== "parent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { studentId } = body as { studentId: string };

    if (!studentId) {
      return NextResponse.json(
        { error: "studentId is required" },
        { status: 400 }
      );
    }

    // Verify student belongs to same family
    const { data: studentProfile } = await adminClient
      .from("users")
      .select("role, family_id")
      .eq("id", studentId)
      .single();

    if (
      !studentProfile ||
      studentProfile.role !== "student" ||
      studentProfile.family_id !== parentProfile.family_id
    ) {
      return NextResponse.json(
        { error: "Student not found in your family" },
        { status: 404 }
      );
    }

    // Delete all student_questions
    await adminClient
      .from("student_questions")
      .delete()
      .eq("student_id", studentId);

    // Delete all sessions
    await adminClient
      .from("sessions")
      .delete()
      .eq("student_id", studentId);

    // Delete all time_balances
    await adminClient
      .from("time_balances")
      .delete()
      .eq("student_id", studentId);

    // Delete all spaced_repetition
    await adminClient
      .from("spaced_repetition")
      .delete()
      .eq("student_id", studentId);

    // Reset all student_stats to defaults
    await adminClient
      .from("student_stats")
      .update({
        elo_rating: 500,
        total_attempted: 0,
        total_correct: 0,
      })
      .eq("student_id", studentId);

    // Reset current_streak (keep longest_streak as historical)
    await adminClient
      .from("streaks")
      .update({
        current_streak: 0,
      })
      .eq("student_id", studentId);

    // Delete all redemption_requests
    await adminClient
      .from("redemption_requests")
      .delete()
      .eq("student_id", studentId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Student reset error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
