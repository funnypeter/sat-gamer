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

    // Get questions already answered this session (to avoid repeats)
    let sessionAnsweredIds = new Set<string>();
    if (sessionId) {
      const { data: sessionAnswered } = await admin
        .from("student_questions")
        .select("question_id")
        .eq("session_id", sessionId);
      sessionAnsweredIds = new Set((sessionAnswered ?? []).map((a: { question_id: string }) => a.question_id));
    }

    // Check spaced repetition first — these are review questions due today
    const today = new Date().toISOString().split("T")[0];
    const { data: srItems } = await admin
      .from("spaced_repetition")
      .select("question_id")
      .eq("student_id", user.id)
      .lte("next_review_date", today)
      .limit(5);

    if (srItems && srItems.length > 0) {
      for (const sr of srItems) {
        if (!sessionAnsweredIds.has(sr.question_id)) {
          const { data: question } = await admin
            .from("questions")
            .select("*")
            .eq("id", sr.question_id)
            .single();
          if (question) {
            return NextResponse.json({
              question: stripAnswer(question),
              source: "spaced_repetition",
            });
          }
        }
      }
    }

    // Get student's weakest category and Elo for targeted generation
    const { data: stats } = await admin
      .from("student_stats")
      .select("category, elo_rating, total_attempted")
      .eq("student_id", user.id)
      .order("elo_rating", { ascending: true });

    // Pick category: weighted toward weakest, with some randomness
    let targetCategory: DsatCategory;
    if (stats && stats.length > 0) {
      // 70% chance: pick from bottom 3 weakest categories
      // 30% chance: random category for variety
      if (Math.random() < 0.7) {
        const weakest = stats.slice(0, 3);
        targetCategory = weakest[Math.floor(Math.random() * weakest.length)].category as DsatCategory;
      } else {
        targetCategory = DSAT_CATEGORIES[Math.floor(Math.random() * DSAT_CATEGORIES.length)];
      }
    } else {
      targetCategory = DSAT_CATEGORIES[Math.floor(Math.random() * DSAT_CATEGORIES.length)];
    }

    // Determine difficulty band from student's Elo
    const catStat = stats?.find((s: { category: string }) => s.category === targetCategory);
    const elo = catStat?.elo_rating ?? 500;
    const band = elo < 450 ? "easy" : elo < 600 ? "medium" : "hard";

    // Generate a fresh batch from Gemini
    const question = await generateAndServe(admin, targetCategory, band);

    if (!question) {
      return NextResponse.json({
        question: null,
        message: "Failed to generate questions. Please try again.",
      });
    }

    return NextResponse.json({
      question: stripAnswer(question),
      source: "generated",
      category: targetCategory,
      difficulty: band,
    });
  } catch (err) {
    console.error("Question fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function stripAnswer(question: Record<string, unknown>) {
  return {
    id: question.id,
    category: question.category,
    passage_text: question.passage_text,
    question_text: question.question_text,
    choices: question.choices,
    difficulty_rating: question.difficulty_rating,
  };
}

async function generateAndServe(
  admin: ReturnType<typeof createAdminClient>,
  category: DsatCategory,
  band: string
): Promise<Record<string, unknown> | null> {
  try {
    const model = getGeminiModel();
    const prompt = buildQuestionGenerationPrompt(category, band as "easy" | "medium" | "hard");
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    // Try to find JSON array in the response
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    const jsonStr = jsonStart >= 0 && jsonEnd > jsonStart ? text.substring(jsonStart, jsonEnd + 1) : text;

    const parsed = JSON.parse(jsonStr);
    const validation = GeneratedQuestionsArraySchema.safeParse(parsed);

    if (!validation.success) {
      console.error("Validation failed:", validation.error.issues.slice(0, 3));
      return null;
    }

    // Insert all questions into cache
    const rows = validation.data.map((q) => ({
      category,
      passage_text: q.passage_text,
      question_text: q.question_text,
      choices: q.choices,
      correct_answer: q.correct_answer,
      explanations: q.explanations,
      difficulty_rating: q.difficulty_rating,
      generated_by: "gemini",
    }));

    const { data: inserted } = await admin.from("questions").insert(rows).select();

    if (inserted && inserted.length > 0) {
      // Return the first one
      return inserted[0];
    }

    return null;
  } catch (err) {
    console.error("Generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
