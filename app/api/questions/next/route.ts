import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectNextQuestion } from "@/lib/engine/question-selector";
import { getGeminiModel } from "@/lib/gemini/client";
import { GeneratedQuestionsArraySchema } from "@/lib/gemini/schema";
import { buildQuestionGenerationPrompt } from "@/lib/gemini/prompts";
import { DSAT_CATEGORIES } from "@/lib/constants";
import type { DsatCategory } from "@/lib/constants";

async function generateQuestions(admin: ReturnType<typeof createAdminClient>, category: string, difficultyBand: string) {
  try {
    const model = getGeminiModel();
    const prompt = buildQuestionGenerationPrompt(category as DsatCategory, difficultyBand as "easy" | "medium" | "hard");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleaned = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const validation = GeneratedQuestionsArraySchema.safeParse(parsed);
    if (!validation.success) return 0;
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
    await admin.from("questions").insert(rows);
    return rows.length;
  } catch (err: unknown) {
    console.error("Auto-generate error:", err instanceof Error ? err.message : err);
    return 0;
  }
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    let question = await selectNextQuestion(admin, user.id);

    // If no questions available, auto-generate for a random category
    if (!question) {
      const randomCategory = DSAT_CATEGORIES[Math.floor(Math.random() * DSAT_CATEGORIES.length)];
      const count = await generateQuestions(admin, randomCategory, "medium");
      if (count > 0) {
        question = await selectNextQuestion(admin, user.id);
      }
    }

    if (!question) {
      return NextResponse.json({ question: null, message: "No questions available. Questions are being generated — please try again in a few seconds." });
    }

    const safeQuestion = {
      id: question.id,
      category: question.category,
      passage_text: question.passage_text,
      question_text: question.question_text,
      choices: question.choices,
      difficulty_rating: question.difficulty_rating,
    };

    return NextResponse.json({ question: safeQuestion });
  } catch (err) {
    console.error("Question fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
