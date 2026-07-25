import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiModel } from "@/lib/gemini/client";
import { GeneratedQuestionsArraySchema } from "@/lib/gemini/schema";
import { buildQuestionGenerationPrompt } from "@/lib/gemini/prompts";
import { DSAT_CATEGORIES } from "@/lib/constants";
import type { DsatCategory } from "@/lib/constants";
import { selectNextQuestion, pickLaggardCategory } from "@/lib/engine/question-selector";
import { shuffleChoices } from "@/lib/engine/shuffle-choices";
import type { Question } from "@/lib/types/database";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") ?? undefined;

    // The selector handles spaced repetition, CB-first prioritization,
    // Elo matching, weak-category targeting, and any-source fallback.
    // It returns null only when every question in the DB has been seen.
    const selected = await selectNextQuestion(admin, user.id, sessionId);
    if (selected) {
      // If this question has an SR row for the student, they got it
      // wrong before — shuffle the choices so they re-think the answer
      // instead of remembering the original A/B/C/D position.
      const { data: srRow } = await admin
        .from("spaced_repetition")
        .select("id")
        .eq("student_id", user.id)
        .eq("question_id", selected.id)
        .maybeSingle();
      if (srRow) {
        const { choices, choiceMap } = shuffleChoices(
          selected.choices,
          selected.correct_answer,
        );
        return NextResponse.json({
          question: stripAnswer({ ...selected, choices }),
          choiceMap,
        });
      }
      return NextResponse.json({ question: stripAnswer(selected) });
    }

    // Pool exhausted — generate a fresh batch from Gemini, targeting a
    // weak category at the right difficulty band.
    const { data: stats } = await admin
      .from("student_stats")
      .select("category, elo_rating, total_attempted")
      .eq("student_id", user.id)
      .order("elo_rating", { ascending: true });

    let targetCategory: DsatCategory;
    const laggard =
      stats && stats.length > 0 && Math.random() < 0.7
        ? pickLaggardCategory(stats)
        : null;
    if (laggard) {
      targetCategory = laggard as DsatCategory;
    } else {
      targetCategory =
        DSAT_CATEGORIES[Math.floor(Math.random() * DSAT_CATEGORIES.length)];
    }

    const catStat = stats?.find(
      (s: { category: string }) => s.category === targetCategory
    );
    const elo = catStat?.elo_rating ?? 500;
    const band = elo < 450 ? "easy" : elo < 600 ? "medium" : "hard";

    const generated = await generateAndServe(admin, targetCategory, band);
    if (generated) {
      return NextResponse.json({ question: stripAnswer(generated) });
    }

    // Generation failed — rather than erroring out, re-serve an
    // already-answered question (never one from this session). Shuffle
    // the choices so it's still real practice instead of label recall.
    const repeat = await selectNextQuestion(admin, user.id, sessionId, {
      allowRepeats: true,
    });
    if (repeat) {
      const { choices, choiceMap } = shuffleChoices(
        repeat.choices,
        repeat.correct_answer,
      );
      return NextResponse.json({
        question: stripAnswer({ ...repeat, choices }),
        choiceMap,
      });
    }

    return NextResponse.json({
      question: null,
      message: "Generating questions failed. Try again.",
    });
  } catch (err) {
    console.error("Question fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function stripAnswer(q: Question | Record<string, unknown>) {
  const generatedBy = (q as { generated_by?: string }).generated_by;
  const source =
    typeof generatedBy === "string" && generatedBy.startsWith("collegeboard")
      ? "College Board"
      : "AI Generated";
  return {
    id: (q as { id: string }).id,
    category: (q as { category: string }).category,
    passage_text: (q as { passage_text: string }).passage_text,
    question_text: (q as { question_text: string }).question_text,
    choices: (q as { choices: unknown }).choices,
    difficulty_rating: (q as { difficulty_rating: number }).difficulty_rating,
    source,
  };
}

async function generateAndServe(
  admin: ReturnType<typeof createAdminClient>,
  category: DsatCategory,
  band: string
) {
  try {
    const model = getGeminiModel();
    const prompt = buildQuestionGenerationPrompt(
      category,
      band as "easy" | "medium" | "hard"
    );
    const result = await model.generateContent(prompt);
    const text = result.response
      .text()
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    const jsonStr =
      jsonStart >= 0 && jsonEnd > jsonStart
        ? text.substring(jsonStart, jsonEnd + 1)
        : text;
    const parsed = JSON.parse(jsonStr);
    const validation = GeneratedQuestionsArraySchema.safeParse(parsed);
    if (!validation.success) return null;
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
    const { data: inserted } = await admin
      .from("questions")
      .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true })
      .select();
    return inserted && inserted.length > 0 ? inserted[0] : null;
  } catch (err) {
    console.error("Generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
