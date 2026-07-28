import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  orderCandidateWords,
  chooseItem,
  wordsNeedingItems,
  type MasteryRow,
  type VocabItemRow,
} from "@/lib/vocab/select";
import { VOCAB_TOTAL } from "@/lib/vocab/word-list";

/**
 * Serve the next vocabulary item.
 *
 * Selection lives entirely in `lib/vocab/select.ts` — this route only fetches
 * what the selector needs, strips the answer, and reports which words need
 * generating when the bank comes up empty. Same division of labor as
 * `/api/questions/next` and `lib/engine/question-selector.ts`: if you need to
 * change what gets drilled next, change the selector, not this route.
 */

/** How many candidate words to fetch items for. Bounds the query, not the queue. */
const CANDIDATE_WINDOW = 40;

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: masteryRows } = await admin
      .from("vocab_mastery")
      .select("word, mastered, next_review_date, consecutive_correct, last_seen_at")
      .eq("student_id", user.id);

    const mastery = (masteryRows ?? []) as MasteryRow[];
    const candidates = orderCandidateWords(mastery).slice(0, CANDIDATE_WINDOW);

    if (candidates.length === 0) {
      // Only reachable if the word list is empty.
      return NextResponse.json({ item: null, needsGeneration: false });
    }

    const candidateWords = candidates.map((c) => c.word.word);

    const [{ data: itemRows }, { data: attemptRows }] = await Promise.all([
      admin
        .from("vocab_items")
        .select("id, word, sentence, choices, correct_answer, explanations, tier")
        .in("word", candidateWords)
        .order("variant_index", { ascending: true }),
      admin
        .from("vocab_attempts")
        .select("item_id, answered_at")
        .eq("student_id", user.id)
        .in("word", candidateWords)
        .order("answered_at", { ascending: false }),
    ]);

    const itemsByWord = new Map<string, VocabItemRow[]>();
    for (const row of (itemRows ?? []) as VocabItemRow[]) {
      if (!itemsByWord.has(row.word)) itemsByWord.set(row.word, []);
      itemsByWord.get(row.word)!.push(row);
    }

    // Rows arrive newest-first, so the first sighting of an item id is its
    // most recent attempt.
    const lastAttemptByItem = new Map<string, string>();
    for (const a of (attemptRows ?? []) as { item_id: string; answered_at: string }[]) {
      if (!lastAttemptByItem.has(a.item_id)) {
        lastAttemptByItem.set(a.item_id, a.answered_at);
      }
    }

    const selected = chooseItem(candidates, itemsByWord, lastAttemptByItem);

    const masteredCount = mastery.filter((m) => m.mastered).length;
    const progress = {
      mastered: masteredCount,
      inProgress: mastery.length - masteredCount,
      total: VOCAB_TOTAL,
    };

    if (!selected) {
      // No candidate word has a generated sentence yet. Tell the client which
      // words to ask for so its retry targets exactly the gap, rather than
      // kicking off a blind bulk build.
      return NextResponse.json({
        item: null,
        needsGeneration: true,
        wordsToGenerate: wordsNeedingItems(candidates, itemsByWord, 20).map(
          (w) => w.word
        ),
        progress,
      });
    }

    return NextResponse.json({
      item: {
        id: selected.item.id,
        word: selected.item.word,
        sentence: selected.item.sentence,
        choices: selected.item.choices,
        tier: selected.item.tier,
      },
      reason: selected.reason,
      repeat: selected.repeat,
      progress,
      // Words running low on variants. The client posts these to
      // /api/vocab/generate in the background after the first answer, the
      // same way the practice page prefetches questions.
      topUp: wordsNeedingItems(candidates, itemsByWord, 10).map((w) => w.word),
    });
  } catch (err) {
    console.error("Vocab fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
