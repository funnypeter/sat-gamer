import { NextResponse } from "next/server";
import { createClient } from "@/lib/db";
import { createAdminClient } from "@/lib/db";
import { createAccount, signupErrorResponse } from "@/lib/signup";

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

    // Verify parent role using admin client
    const { data: parentProfile } = await adminClient
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

    // Login + profile + initial stats/streak; the parent stays signed in as themselves.
    let student;
    try {
      student = await createAccount(
        { email, password, displayName, familyId: parentProfile.family_id, role: "student" },
        { signIn: false }
      );
    } catch (err) {
      const { error, status } = signupErrorResponse(err);
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({
      success: true,
      studentId: student.id,
    });
  } catch (err) {
    console.error("Student creation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
