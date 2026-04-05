import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiModel } from "@/lib/gemini/client";
import { fetchPineSATQuestions } from "@/lib/collegeboard/pinesat-client";
import { transformPineSATQuestion, type TransformedQuestion } from "@/lib/collegeboard/transform";
import { DSAT_CATEGORIES } from "@/lib/constants";

const DOMAIN_TO_POSSIBLE_CATEGORIES: Record<string, string[]> = {
  "Information and Ideas": [
    "Central Ideas & Details",
    "Command of Evidence (Textual)",
    "Command of Evidence (Quantitative)",
    "Inferences",
  ],
  "Craft and Structure": [
    "Words in Context",
    "Text Structure & Purpose",
    "Cross-Text Connections",
  ],
  "Expression of Ideas": ["Rhetoric", "Transitions"],
  "Standard English Conventions": ["Standard English Conventions"],
};

function buildEnrichmentPrompt(batch: TransformedQuestion[]): string {
  const categoryList = DSAT_CATEGORIES.join(", ");
  const questions = batch.map((q, i) => {
    const possibleCats =
      DOMAIN_TO_POSSIBLE_CATEGORIES[q._originalDomain] ??
      DSAT_CATEGORIES.slice();
    return `
QUESTION ${i + 1}:
Domain: ${q._originalDomain}
Possible categories: ${possibleCats.join(", ")}
Passage: ${q.passage_text.substring(0, 500)}
Question: ${q.question_text}
Choices: A) ${q.choices[0]?.text} B) ${q.choices[1]?.text} C) ${q.choices[2]?.text} D) ${q.choices[3]?.text}
Correct answer: ${q.correct_answer}
Original explanation: ${q._originalExplanation.substring(0, 300)}`;
  });

  return `You are classifying Digital SAT Reading & Writing questions and generating per-choice explanations.

Valid categories: ${categoryList}

For each question below:
1. Classify it into the BEST matching category from the "Possible categories" list
2. Generate a brief explanation (1-2 sentences) for EACH choice (A, B, C, D) explaining why it is correct or incorrect

Return ONLY a JSON array with one object per question:
[
  {
    "category": "exact category name",
    "explanations": {
      "A": "explanation for A",
      "B": "explanation for B",
      "C": "explanation for C",
      "D": "explanation for D"
    }
  }
]

${questions.join("\n")}

Return ONLY the JSON array, no markdown fences.`;
}

export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Verify parent role
    const { data: profile } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "parent") {
      return NextResponse.json({ error: "Parent access required" }, { status: 403 });
    }

    // Fetch all English questions from PineSAT
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
        skipped: transformed.length,
        errors: [],
        message: "All questions already imported",
      });
    }

    const model = getGeminiModel();
    const BATCH_SIZE = 5;
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < newQuestions.length; i += BATCH_SIZE) {
      const batch = newQuestions.slice(i, i + BATCH_SIZE);

      try {
        const prompt = buildEnrichmentPrompt(batch);
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

        const enrichments = JSON.parse(jsonStr) as {
          category: string;
          explanations: Record<string, string>;
        }[];

        const rows = [];
        for (let j = 0; j < batch.length; j++) {
          const q = batch[j];
          const enrichment = enrichments[j];

          if (!enrichment) {
            skipped++;
            continue;
          }

          // Validate category is one of our DSAT categories
          const category = DSAT_CATEGORIES.find(
            (c) => c === enrichment.category
          );
          if (!category) {
            errors.push(
              `Invalid category "${enrichment.category}" for: ${q.question_text.substring(0, 50)}`
            );
            skipped++;
            continue;
          }

          // Validate explanations have all 4 keys
          const hasAllExplanations =
            enrichment.explanations &&
            ["A", "B", "C", "D"].every(
              (k) => typeof enrichment.explanations[k] === "string"
            );

          rows.push({
            category,
            passage_text: q.passage_text,
            question_text: q.question_text,
            choices: q.choices,
            correct_answer: q.correct_answer,
            explanations: hasAllExplanations
              ? enrichment.explanations
              : {
                  A: enrichment.explanations?.A ?? "",
                  B: enrichment.explanations?.B ?? "",
                  C: enrichment.explanations?.C ?? "",
                  D: enrichment.explanations?.D ?? "",
                },
            difficulty_rating: q.difficulty_rating,
            generated_by: "collegeboard",
          });
        }

        if (rows.length > 0) {
          const { error: insertError } = await admin
            .from("questions")
            .insert(rows);
          if (insertError) {
            errors.push(`Insert error at batch ${i}: ${insertError.message}`);
            skipped += rows.length;
          } else {
            imported += rows.length;
          }
        }
      } catch (err) {
        errors.push(
          `Batch ${i} error: ${err instanceof Error ? err.message : "unknown"}`
        );
        skipped += batch.length;
      }

      // Rate limit delay
      if (i + BATCH_SIZE < newQuestions.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      total: transformed.length,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error("CB import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
