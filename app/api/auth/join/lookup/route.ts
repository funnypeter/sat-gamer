import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: family } = await admin
    .from("families")
    .select("name")
    .eq("invite_code", code.toUpperCase())
    .single();

  if (!family) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  return NextResponse.json({ familyName: family.name });
}
