import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db";
import { createAccount, signupErrorResponse } from "@/lib/signup";

/** Join an existing family as a parent via its invite code, and sign in. */
export async function POST(req: NextRequest) {
  const { email, password, displayName, inviteCode } = await req.json().catch(() => ({}));

  if (!email || !password || !displayName || !inviteCode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: families } = await admin.rpc("get_family_by_invite_code", {
    code_input: String(inviteCode).toUpperCase(),
  });
  const family = Array.isArray(families) ? families[0] : families;

  if (!family) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  try {
    await createAccount(
      { email, password, displayName, familyId: family.id, role: "parent" },
      { signIn: true }
    );
  } catch (err) {
    const { error, status } = signupErrorResponse(err);
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ success: true, familyId: family.id });
}
