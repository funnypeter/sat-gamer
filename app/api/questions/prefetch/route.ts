import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiModel } from "@/lib/gemini/client";
import { GeneratedQuestionsArraySchema } from "@/lib/gemini/schema";
import { buildQuestionGenerationPrompt } from "@/lib/gemini/prompts";
import { DSAT_CATEGORIES } from "@/lib/constants";
import type { DsatCategory } from "@/lib/constants";

export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: stats } = await admin.from("student_stats").select("category, elo_rating").eq("student_id", user.id).order("elo_rating", { ascending: true });

    let targetCategory: DsatCategory;
    if (stats && stats.length > 0 && Math.random() < 0.7) {
      const weakest = stats.slice(0, 3);
      targetCategory = weakest[Math.floor(Math.random() * weakest.length)].category as DsatCategory;
    } else {
      targetCategory = DSAT_CATEGORIES[Math.floor(Math.random() * DSAT_CATEGORIES.length)];
    }

    const catStat = stats?.find((s: { category: string }) => s.category === targetCategory);
    const elo = catStat?.elo_rating ?? 500;
    const band = elo < 450 ? "easy" : elo < 600 ? "medium" : "hard";

    const model = getGeminiModel();
    const prompt = buildQuestionGenerationPrompt(targetCategory, band as "easy" | "medium" | "hard");
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    const jsonStr = jsonStart >= 0 && jsonEnd > jsonStart ? text.substring(jsonStart, jsonEnd + 1) : text;
    const parsed = JSON.parse(jsonStr);
    const validation = GeneratedQuestionsArraySchema.safeParse(parsed);
    if (!validation.success) return NextResponse.json({ count: 0 });

    const rows = validation.data.map((q) => ({ category: targetCategory, passage_text: q.passage_text, question_text: q.question_text, choices: q.choices, correct_answer: q.correct_answer, explanations: q.explanations, difficulty_rating: q.difficulty_rating, generated_by: "gemini" }));
    await admin.from("questions").insert(rows);

    return NextResponse.json({ count: rows.length });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
