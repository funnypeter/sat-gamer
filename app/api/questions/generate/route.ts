import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiModel } from "@/lib/gemini/client";
import { GeneratedQuestionsArraySchema } from "@/lib/gemini/schema";
import { buildQuestionGenerationPrompt } from "@/lib/gemini/prompts";
import { DSAT_CATEGORIES, DIFFICULTY_BANDS } from "@/lib/constants";
import type { DsatCategory, DifficultyBand } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { category, difficultyBand } = body as {
      category: string;
      difficultyBand: string;
    };

    // Validate inputs
    if (!DSAT_CATEGORIES.includes(category as DsatCategory)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    if (!Object.keys(DIFFICULTY_BANDS).includes(difficultyBand)) {
      return NextResponse.json(
        { error: "Invalid difficulty band" },
        { status: 400 }
      );
    }

    // Generate questions with Gemini
    const model = getGeminiModel();
    const prompt = buildQuestionGenerationPrompt(
      category as DsatCategory,
      difficultyBand as DifficultyBand
    );

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Clean any markdown fences
    const cleaned = responseText
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // Parse and validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Gemini returned invalid JSON" },
        { status: 500 }
      );
    }

    const validation = GeneratedQuestionsArraySchema.safeParse(parsed);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validation.error.issues,
        },
        { status: 500 }
      );
    }

    // Insert using admin client (bypasses RLS)
    const adminClient = createAdminClient();
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

    const { error: insertError } = await adminClient
      .from("questions")
      .insert(rows);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert questions", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: rows.length, success: true });
  } catch (err) {
    console.error("Question generation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
