import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DSAT_CATEGORIES } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify parent role
    const { data: parentProfile } = await supabase
      .from("users")
      .select("role, family_id")
      .eq("id", user.id)
      .single();

    if (!parentProfile || parentProfile.role !== "parent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { displayName, email, password } = body as {
      displayName: string;
      email: string;
      password: string;
    };

    if (!displayName || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Create auth user
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          role: "student",
        },
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? "Failed to create auth user" },
        { status: 500 }
      );
    }

    // Create user profile
    const { error: profileError } = await adminClient.from("users").insert({
      id: authData.user.id,
      family_id: parentProfile.family_id,
      role: "student",
      display_name: displayName,
      email,
    });

    if (profileError) {
      return NextResponse.json(
        { error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    // Create initial stats for all categories
    const initialStats = DSAT_CATEGORIES.map((category) => ({
      student_id: authData.user.id,
      category,
      elo_rating: 500,
      total_attempted: 0,
      total_correct: 0,
    }));

    await adminClient.from("student_stats").insert(initialStats);

    // Create initial streak
    await adminClient.from("streaks").insert({
      student_id: authData.user.id,
      current_streak: 0,
      longest_streak: 0,
    });

    return NextResponse.json({
      success: true,
      studentId: authData.user.id,
    });
  } catch (err) {
    console.error("Student creation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
