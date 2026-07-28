import type { createAdminClient } from "@/lib/supabase/admin";
import { getGeminiModel } from "@/lib/gemini/client";
import { pickDistractors, buildChoiceSet } from "./distractors";
import { buildVocabSentencePrompt, buildExplanations, type SentenceRequest } from "./prompts";
import { RawVocabSentencesArraySchema, validateSentence } from "./schema";
import type { VocabWord } from "./word-list";

/**
 * Vocabulary item generation.
 *
 * Runs only in the background — from the parent-side bank builder or from the
 * vocab page's "building your word bank" retry loop. It is never in the path
 * between a student's Submit and their feedback screen. (Same rule as the
 * question flow: see the note atop `app/api/sessions/answer/route.ts` about
 * never putting an AI round-trip in the answer path.)
 */

/** Words per Gemini call. Ten sentences plus notes is a comfortable response size. */
export const WORDS_PER_CALL = 10;

/** Concurrent Gemini calls per request. 4 × 10 = 40 words inside the 60s Hobby-plan limit. */
export const CALLS_PER_REQUEST = 4;

export interface GenerationResult {
  inserted: number;
  attempted: number;
  /** reason -> count, for diagnostics in the parent UI */
  rejections: Record<string, number>;
}

interface PreparedItem {
  request: SentenceRequest;
  row: {
    word: string;
    tier: number;
    variant_index: number;
    choices: { label: string; text: string }[];
    correct_answer: string;
    wordByLabel: Record<string, VocabWord>;
  };
}

/**
 * Generate one new sentence variant for each supplied word.
 *
 * `variantIndexByWord` gives the number of items the word already has, which
 * becomes the new variant's index — that seeds distractor selection, so
 * variant 2 of a word draws a different (but reproducible) set of wrong
 * answers than variant 1.
 */
export async function generateItemsForWords(
  admin: ReturnType<typeof createAdminClient>,
  words: VocabWord[],
  variantIndexByWord: Map<string, number>
): Promise<GenerationResult> {
  const rejections: Record<string, number> = {};
  const reject = (reason: string) => {
    rejections[reason] = (rejections[reason] ?? 0) + 1;
  };

  // Prepare choices in code first. A word whose bank can't supply three
  // valid distractors is skipped outright rather than padded with a
  // wrong-part-of-speech filler that would give the item away.
  const prepared: PreparedItem[] = [];
  for (const word of words) {
    const variantIndex = variantIndexByWord.get(word.word) ?? 0;
    const distractors = pickDistractors(word, { variantIndex });
    if (distractors.length < 3) {
      reject("no eligible distractors");
      continue;
    }
    const { choices, correctAnswer, wordByLabel } = buildChoiceSet(
      word,
      distractors,
      variantIndex
    );
    prepared.push({
      request: { target: word, distractors, variantIndex },
      row: {
        word: word.word,
        tier: word.tier,
        variant_index: variantIndex,
        choices,
        correct_answer: correctAnswer,
        wordByLabel,
      },
    });
  }

  if (prepared.length === 0) {
    return { inserted: 0, attempted: words.length, rejections };
  }

  const batches: PreparedItem[][] = [];
  for (let i = 0; i < prepared.length; i += WORDS_PER_CALL) {
    batches.push(prepared.slice(i, i + WORDS_PER_CALL));
  }

  const rows: Record<string, unknown>[] = [];

  // Run batches in waves so a large request doesn't open 30 concurrent
  // Gemini connections.
  for (let i = 0; i < batches.length; i += CALLS_PER_REQUEST) {
    const wave = batches.slice(i, i + CALLS_PER_REQUEST);
    const results = await Promise.all(wave.map((b) => runBatch(b)));
    for (const r of results) {
      rows.push(...r.rows);
      for (const [reason, n] of Object.entries(r.rejections)) {
        rejections[reason] = (rejections[reason] ?? 0) + n;
      }
    }
  }

  if (rows.length === 0) {
    return { inserted: 0, attempted: prepared.length, rejections };
  }

  // Same dedupe contract as questions: upsert on the stored content hash so a
  // retried batch is a no-op rather than a second copy of the same sentence.
  const { data: insertedRows, error } = await admin
    .from("vocab_items")
    .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true })
    .select("id");

  if (error) {
    reject(`insert failed: ${error.message}`);
    return { inserted: 0, attempted: prepared.length, rejections };
  }

  return {
    inserted: insertedRows?.length ?? 0,
    attempted: prepared.length,
    rejections,
  };
}

async function runBatch(batch: PreparedItem[]): Promise<{
  rows: Record<string, unknown>[];
  rejections: Record<string, number>;
}> {
  const rejections: Record<string, number> = {};
  const reject = (reason: string) => {
    rejections[reason] = (rejections[reason] ?? 0) + 1;
  };

  let parsed: unknown;
  try {
    const model = getGeminiModel();
    const prompt = buildVocabSentencePrompt(batch.map((b) => b.request));
    const result = await model.generateContent(prompt);
    const text = result.response
      .text()
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    parsed = JSON.parse(
      start >= 0 && end > start ? text.substring(start, end + 1) : text
    );
  } catch (err) {
    console.error("Vocab generation error:", err instanceof Error ? err.message : err);
    for (let i = 0; i < batch.length; i++) reject("gemini call failed");
    return { rows: [], rejections };
  }

  const validation = RawVocabSentencesArraySchema.safeParse(parsed);
  if (!validation.success) {
    for (let i = 0; i < batch.length; i++) reject("malformed response");
    return { rows: [], rejections };
  }

  // Match on the word rather than array position — the model occasionally
  // reorders or drops an item, and a positional match would silently attach
  // one word's sentence to another word's choices.
  const byWord = new Map(
    validation.data.map((s) => [s.word.toLowerCase().trim(), s])
  );

  const rows: Record<string, unknown>[] = [];
  for (const item of batch) {
    const raw = byWord.get(item.request.target.word);
    if (!raw) {
      reject("no sentence returned");
      continue;
    }

    const check = validateSentence(raw, item.request.target, item.request.distractors);
    if (!check.ok) {
      reject(check.reason);
      continue;
    }

    rows.push({
      word: item.row.word,
      sentence: check.sentence,
      choices: item.row.choices,
      correct_answer: item.row.correct_answer,
      explanations: buildExplanations(
        item.request.target,
        item.row.wordByLabel,
        raw.distractor_notes
      ),
      tier: item.row.tier,
      variant_index: item.row.variant_index,
      generated_by: "gemini",
    });
  }

  return { rows, rejections };
}

/**
 * Count existing items per word. Used both to pick which words still need
 * generating and to assign the next variant index.
 */
export async function countItemsByWord(
  admin: ReturnType<typeof createAdminClient>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  // Paginate: Supabase caps a single select at 1000 rows by default, and a
  // fully built bank is ~1000 items today and grows with the word list.
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("vocab_items")
      .select("word")
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data as { word: string }[]) {
      counts.set(row.word, (counts.get(row.word) ?? 0) + 1);
    }
    if (data.length < pageSize) break;
  }
  return counts;
}
