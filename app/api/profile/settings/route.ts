import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("show_question_timer")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    showQuestionTimer: profile?.show_question_timer ?? true,
  });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (typeof body.showQuestionTimer !== "boolean") {
    return NextResponse.json({ error: "showQuestionTimer must be a boolean" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ show_question_timer: body.showQuestionTimer })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 });
  }
  return NextResponse.json({ showQuestionTimer: body.showQuestionTimer });
}
