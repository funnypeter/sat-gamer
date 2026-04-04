import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: balances } = await admin
    .from("time_balances")
    .select("minutes_remaining")
    .eq("student_id", user.id)
    .eq("redeemed", false)
    .gt("expires_at", new Date().toISOString())
    .gt("minutes_remaining", 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const availableMinutes = balances?.reduce((sum: number, b: any) => sum + Number(b.minutes_remaining), 0) ?? 0;

  return NextResponse.json({ availableMinutes: Math.round(availableMinutes * 100) / 100 });
}
