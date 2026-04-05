import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiModel } from "@/lib/gemini/client";
import { GeneratedQuestionsArraySchema } from "@/lib/gemini/schema";
import { buildQuestionGenerationPrompt } from "@/lib/gemini/prompts";
import { DSAT_CATEGORIES } from "@/lib/constants";
import type { DsatCategory } from "@/lib/constants";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    // Get questions already answered this session
    let sessionAnsweredIds = new Set<string>();
    if (sessionId) {
      const { data: sa } = await admin.from("student_questions").select("question_id").eq("session_id", sessionId);
      sessionAnsweredIds = new Set((sa ?? []).map((a: { question_id: string }) => a.question_id));
    }

    // Get ALL questions this student has ever answered
    const { data: allAnswered } = await admin.from("student_questions").select("question_id").eq("student_id", user.id);
    const allAnsweredIds = new Set((allAnswered ?? []).map((a: { question_id: string }) => a.question_id));

    // 1. Try spaced repetition first
    const today = new Date().toISOString().split("T")[0];
    const { data: srItems } = await admin.from("spaced_repetition").select("question_id").eq("student_id", user.id).lte("next_review_date", today).limit(5);
    if (srItems) {
      for (const sr of srItems) {
        if (!sessionAnsweredIds.has(sr.question_id)) {
          const { data: q } = await admin.from("questions").select("*").eq("id", sr.question_id).single();
          if (q) return NextResponse.json({ question: stripAnswer(q) });
        }
      }
    }

    // 2. Try unseen College Board questions first
    //    Use NOT IN to let Postgres filter out answered questions directly
    const answeredIds = Array.from(allAnsweredIds).concat(Array.from(sessionAnsweredIds));
    let cbQuery = admin
      .from("questions")
      .select("*")
      .or("generated_by.eq.collegeboard,generated_by.eq.collegeboard-classified")
      .limit(1);
    if (answeredIds.length > 0) {
      cbQuery = cbQuery.not("id", "in", `(${answeredIds.join(",")})`);
    }
    const { data: cbRow } = await cbQuery;
    if (cbRow && cbRow.length > 0) {
      return NextResponse.json({ question: stripAnswer(cbRow[0]) });
    }

    // 3. Fall back to any unseen questions
    let fallbackQuery = admin.from("questions").select("*").limit(1);
    if (answeredIds.length > 0) {
      fallbackQuery = fallbackQuery.not("id", "in", `(${answeredIds.join(",")})`);
    }
    const { data: fallbackRow } = await fallbackQuery;
    if (fallbackRow && fallbackRow.length > 0) {
      return NextResponse.json({ question: stripAnswer(fallbackRow[0]) });
    }

    // 3. Cache empty or exhausted — generate fresh batch from Gemini
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

    const question = await generateAndServe(admin, targetCategory, band);
    if (!question) {
      return NextResponse.json({ question: null, message: "Generating questions failed. Try again." });
    }

    return NextResponse.json({ question: stripAnswer(question) });
  } catch (err) {
    console.error("Question fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function stripAnswer(q: Record<string, unknown>) {
  const source = typeof q.generated_by === "string" && (q.generated_by as string).startsWith("collegeboard") ? "College Board" : "AI Generated";
  return { id: q.id, category: q.category, passage_text: q.passage_text, question_text: q.question_text, choices: q.choices, difficulty_rating: q.difficulty_rating, source };
}

async function generateAndServe(admin: ReturnType<typeof createAdminClient>, category: DsatCategory, band: string) {
  try {
    const model = getGeminiModel();
    const prompt = buildQuestionGenerationPrompt(category, band as "easy" | "medium" | "hard");
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    const jsonStr = jsonStart >= 0 && jsonEnd > jsonStart ? text.substring(jsonStart, jsonEnd + 1) : text;
    const parsed = JSON.parse(jsonStr);
    const validation = GeneratedQuestionsArraySchema.safeParse(parsed);
    if (!validation.success) return null;
    const rows = validation.data.map((q) => ({ category, passage_text: q.passage_text, question_text: q.question_text, choices: q.choices, correct_answer: q.correct_answer, explanations: q.explanations, difficulty_rating: q.difficulty_rating, generated_by: "gemini" }));
    const { data: inserted } = await admin.from("questions").insert(rows).select();
    return inserted && inserted.length > 0 ? inserted[0] : null;
  } catch (err) {
    console.error("Generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
