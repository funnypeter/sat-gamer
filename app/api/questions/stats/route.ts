import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Count by generated_by
    const { data: all } = await admin
      .from("questions")
      .select("generated_by");

    const counts: Record<string, number> = {};
    (all ?? []).forEach((q: { generated_by: string }) => {
      counts[q.generated_by] = (counts[q.generated_by] || 0) + 1;
    });

    // Total
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return NextResponse.json({ total, bySource: counts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
