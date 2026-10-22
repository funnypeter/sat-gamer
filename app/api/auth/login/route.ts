import { NextRequest, NextResponse } from "next/server";
import { AuthError, signInWithPassword } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  try {
    const user = await signInWithPassword(String(email ?? ""), String(password ?? ""));
    const { data: profile } = await createAdminClient()
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    return NextResponse.json({ role: profile?.role ?? "student" });
  } catch (err) {
    const message = err instanceof AuthError ? err.message : "Login failed. Please try again.";
    if (!(err instanceof AuthError)) console.error("Login error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
