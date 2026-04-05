import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPineSATQuestions } from "@/lib/collegeboard/pinesat-client";
import { transformPineSATQuestion } from "@/lib/collegeboard/transform";

export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    // Fetch all English questions from PineSAT (~1s)
    const raw = await fetchPineSATQuestions();
    const transformed = raw.map(transformPineSATQuestion);

    // Get existing CB question texts to deduplicate
    const { data: existing } = await admin
      .from("questions")
      .select("question_text")
      .eq("generated_by", "collegeboard");
    const existingTexts = new Set(
      (existing ?? []).map((q: { question_text: string }) => q.question_text)
    );

    const newQuestions = transformed.filter(
      (q) => !existingTexts.has(q.question_text)
    );

    if (newQuestions.length === 0) {
      return NextResponse.json({
        imported: 0,
        total: transformed.length,
        done: true,
      });
    }

    // Bulk insert all at once
    const { error: insertError } = await admin
      .from("questions")
      .insert(newQuestions);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imported: newQuestions.length,
      total: transformed.length,
      done: true,
    });
  } catch (err) {
    console.error("CB import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
