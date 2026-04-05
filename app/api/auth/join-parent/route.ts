import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { userId, email, displayName, inviteCode } = await req.json();

  if (!userId || !email || !displayName || !inviteCode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Look up family by invite code
  const { data: families } = await admin.rpc("get_family_by_invite_code", {
    code_input: inviteCode.toUpperCase(),
  });

  const family = Array.isArray(families) ? families[0] : families;

  if (!family) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  // 2. Create user profile as parent in that family
  const { error: userError } = await admin.from("users").insert({
    id: userId,
    family_id: family.id,
    role: "parent",
    display_name: displayName,
    email,
  });

  if (userError) {
    console.error("Parent join error:", userError);
    return NextResponse.json({ error: "Failed to create parent profile" }, { status: 500 });
  }

  return NextResponse.json({ success: true, familyId: family.id });
}
