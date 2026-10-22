import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db";
import { createAccount, signupErrorResponse } from "@/lib/signup";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** New parent: creates the family, the login, the profile, and signs in. */
export async function POST(req: NextRequest) {
  const { email, password, displayName, familyName } = await req.json().catch(() => ({}));

  if (!email || !password || !displayName || !familyName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Create family with invite code
  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({ name: familyName, invite_code: generateInviteCode() })
    .select()
    .single();

  if (familyError || !family) {
    return NextResponse.json({ error: familyError?.message || "Failed to create family" }, { status: 500 });
  }

  // 2. Login + parent profile
  try {
    await createAccount(
      { email, password, displayName, familyId: family.id, role: "parent" },
      { signIn: false }
    );
  } catch (err) {
    // Clean up family if account creation fails
    await admin.from("families").delete().eq("id", family.id);
    const { error, status } = signupErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ familyId: family.id });
}
