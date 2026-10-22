import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const { data } = await createAdminClient().rpc("get_family_by_invite_code", {
    code_input: code.toUpperCase(),
  });

  const family = Array.isArray(data) ? data[0] : data;
  if (!family) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }
  return NextResponse.json({ familyName: family.name });
}
