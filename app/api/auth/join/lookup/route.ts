import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Use raw SQL to bypass PostgREST schema cache
  const { data, error } = await admin.rpc("get_family_by_invite_code", {
    code_input: code.toUpperCase(),
  });

  // Fallback to direct query if RPC doesn't exist yet
  if (error) {
    const { data: family } = await admin
      .from("families")
      .select("name, invite_code")
      .single();

    // Manual filter since schema cache might not have invite_code
    if (family && (family as Record<string, unknown>).invite_code === code.toUpperCase()) {
      return NextResponse.json({ familyName: family.name });
    }

    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  const family = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ familyName: family.name });
}
