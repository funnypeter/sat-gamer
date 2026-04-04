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
    const model = getGeminiModel();
    const bands = ["easy", "medium", "hard"] as const;
    let totalGenerated = 0;
    const errors: string[] = [];

    // Generate for each category and band
    for (const category of DSAT_CATEGORIES) {
      for (const band of bands) {
        try {
          const prompt = buildQuestionGenerationPrompt(category as DsatCategory, band);
          const result = await model.generateContent(prompt);
          const text = result.response.text().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const parsed = JSON.parse(text);
          const validation = GeneratedQuestionsArraySchema.safeParse(parsed);
          if (validation.success) {
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
            totalGenerated += rows.length;
          } else {
            errors.push(`${category}/${band}: validation failed`);
          }
        } catch (err) {
          errors.push(`${category}/${band}: ${err instanceof Error ? err.message : "unknown"}`);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return NextResponse.json({ totalGenerated, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
