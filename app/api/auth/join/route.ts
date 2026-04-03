import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DSAT_CATEGORIES } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const { userId, email, displayName, inviteCode } = await req.json();

  if (!userId || !email || !displayName || !inviteCode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Look up family by invite code
  const { data: family, error: familyError } = await admin
    .from("families")
    .select("id, name")
    .eq("invite_code", inviteCode.toUpperCase())
    .single();

  if (familyError || !family) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  // 2. Create user profile
  const { error: userError } = await admin.from("users").insert({
    id: userId,
    family_id: family.id,
    role: "student",
    display_name: displayName,
    email,
  });

  if (userError) {
    console.error("User creation error:", userError);
    return NextResponse.json({ error: "Failed to create user profile" }, { status: 500 });
  }

  // 3. Create initial student_stats for all 10 DSAT categories
  const initialStats = DSAT_CATEGORIES.map((category) => ({
    student_id: userId,
    category,
    elo_rating: 500,
    total_attempted: 0,
    total_correct: 0,
  }));

  const { error: statsError } = await admin.from("student_stats").insert(initialStats);

  if (statsError) {
    console.error("Stats creation error:", statsError);
  }

  // 4. Create initial streaks row
  const { error: streakError } = await admin.from("streaks").insert({
    student_id: userId,
    current_streak: 0,
    longest_streak: 0,
  });

  if (streakError) {
    console.error("Streak creation error:", streakError);
  }

  return NextResponse.json({ success: true, familyId: family.id });
}
