import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VOCAB_WORDS, getVocabWord, VOCAB_TOTAL, type VocabWord } from "@/lib/vocab/word-list";
import {
  generateItemsForWords,
  countItemsByWord,
  WORDS_PER_CALL,
  CALLS_PER_REQUEST,
} from "@/lib/vocab/generate";

/**
 * Build the vocabulary item bank.
 *
 * Two callers:
 *  - The parent-side bank builder (`VocabBankButton`), which loops this route
 *    until `remaining` hits zero. One request per loop keeps each inside the
 *    60s Hobby-plan function limit, exactly like the College Board importer.
 *  - The student vocab page, when the selector finds no item for any
 *    candidate word — it posts a small targeted batch and retries.
 *
 * `targetPerWord` defaults to 1: the first pass gives every word one sentence
 * so practice can start across the whole list, and later passes (2, then 3)
 * fill in the variants that keep a re-drilled word from being the same
 * sentence twice.
 */
export const maxDuration = 60;

const WORDS_PER_REQUEST = WORDS_PER_CALL * CALLS_PER_REQUEST;

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const body = await request.json().catch(() => ({}));
    const { words: requestedWords, targetPerWord = 1 } = body as {
      words?: string[];
      targetPerWord?: number;
    };

    const target = Math.min(Math.max(1, Number(targetPerWord) || 1), 3);
    const counts = await countItemsByWord(admin);

    let batch: VocabWord[];
    let remaining: number;

    if (Array.isArray(requestedWords) && requestedWords.length > 0) {
      // Targeted top-up from the student page: only the words the selector
      // actually wanted and couldn't serve.
      batch = requestedWords
        .map((w) => getVocabWord(w))
        .filter((w): w is VocabWord => Boolean(w))
        .slice(0, WORDS_PER_REQUEST);
      remaining = 0;
    } else {
      // Bulk build: lowest tier first, so if the parent stops halfway the
      // words a student meets first are the ones that got built.
      const needing = VOCAB_WORDS.filter(
        (w) => (counts.get(w.word) ?? 0) < target
      ).sort((a, b) => a.tier - b.tier);
      batch = needing.slice(0, WORDS_PER_REQUEST);
      remaining = Math.max(0, needing.length - batch.length);
    }

    if (batch.length === 0) {
      return NextResponse.json({
        inserted: 0,
        attempted: 0,
        rejections: {},
        remaining: 0,
        totalWords: VOCAB_TOTAL,
        wordsWithItems: countWordsWithItems(counts),
        done: true,
      });
    }

    const variantIndexByWord = new Map(
      batch.map((w) => [w.word, counts.get(w.word) ?? 0])
    );

    const result = await generateItemsForWords(admin, batch, variantIndexByWord);

    return NextResponse.json({
      ...result,
      remaining,
      totalWords: VOCAB_TOTAL,
      // Counted before this batch ran. The bank builder loops, so the next
      // request's count already includes what we just inserted — reporting
      // the pre-count avoids conflating "items inserted" with "words
      // covered", which diverge as soon as a word gains a second variant.
      wordsWithItems: countWordsWithItems(counts),
      done: remaining === 0,
    });
  } catch (err) {
    console.error("Vocab generation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function countWordsWithItems(counts: Map<string, number>): number {
  let n = 0;
  counts.forEach((c) => {
    if (c > 0) n++;
  });
  return n;
}
