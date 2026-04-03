import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  const { userId, email, displayName, familyName } = await req.json();

  if (!userId || !email || !displayName || !familyName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Use admin client to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Create family with invite code
  const inviteCode = generateInviteCode();
  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert({ name: familyName, invite_code: inviteCode })
    .select()
    .single();

  if (familyError || !family) {
    return NextResponse.json({ error: familyError?.message || "Failed to create family" }, { status: 500 });
  }

  // 2. Create user profile
  const { error: userError } = await supabase.from("users").insert({
    id: userId,
    family_id: family.id,
    role: "parent",
    display_name: displayName,
    email,
  });

  if (userError) {
    // Clean up family if user creation fails
    await supabase.from("families").delete().eq("id", family.id);
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  return NextResponse.json({ familyId: family.id });
}
