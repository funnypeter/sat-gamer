import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SETTINGS, VOCAB_EARNING_RATES, VOCAB_MASTERY } from "@/lib/constants";
import { startOfWeekInAppTimezone, todayInAppTimezone } from "@/lib/date";
import { nextMastery, INITIAL_MASTERY, type MasteryState } from "@/lib/vocab/mastery";
import { getVocabWord } from "@/lib/vocab/word-list";

/**
 * Grade one vocabulary answer.
 *
 * Like `/api/sessions/answer`, this route sits between Submit and the
 * feedback screen, so it is latency-critical: reads run in one batch, writes
 * in another, and there is no AI call anywhere in the path. If you ever want
 * a model-written hint here, generate it beforehand and store it on the item.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body = await request.json();
    const { sessionId, itemId, answerGiven, timeSpentSeconds } = body as {
      sessionId: string;
      itemId: string;
      answerGiven: string;
      timeSpentSeconds: number;
    };

    if (!sessionId || !itemId || !answerGiven) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Idempotency, same contract as the question answer route: a double
    // submit after a network flake returns the recorded result instead of
    // writing a second attempt and double-counting mastery and earnings.
    const [{ data: item }, { data: alreadyAnswered }] = await Promise.all([
      admin.from("vocab_items").select("*").eq("id", itemId).single(),
      admin
        .from("vocab_attempts")
        .select("is_correct")
        .eq("session_id", sessionId)
        .eq("item_id", itemId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const definition = getVocabWord(item.word)?.definition ?? "";

    if (alreadyAnswered) {
      return NextResponse.json({
        isCorrect: alreadyAnswered.is_correct,
        correctAnswer: item.correct_answer,
        explanations: item.explanations,
        word: item.word,
        definition,
        minutesAwarded: 0,
        earnedThisWeek: 0,
        weeklyCap: DEFAULT_SETTINGS.weeklyCapMinutes,
        duplicate: true,
      });
    }

    const isCorrect = answerGiven === item.correct_answer;
    const weekStart = startOfWeekInAppTimezone();

    const [{ data: existingMastery }, { data: weekBalances }, { data: session }] =
      await Promise.all([
        admin
          .from("vocab_mastery")
          .select("*")
          .eq("student_id", user.id)
          .eq("word", item.word)
          .maybeSingle(),
        admin
          .from("time_balances")
          .select("minutes_earned")
          .eq("student_id", user.id)
          .gte("earned_at", weekStart.toISOString()),
        admin
          .from("sessions")
          .select("total_questions, correct_count, minutes_earned")
          .eq("id", sessionId)
          .single(),
      ]);

    const prev: MasteryState = existingMastery
      ? {
          times_seen: existingMastery.times_seen,
          times_correct: existingMastery.times_correct,
          consecutive_correct: existingMastery.consecutive_correct,
          mastered: existingMastery.mastered,
          next_review_date: existingMastery.next_review_date,
          interval_days: existingMastery.interval_days,
          ease_factor: Number(existingMastery.ease_factor),
        }
      : INITIAL_MASTERY;

    const updated = nextMastery(prev, isCorrect, todayInAppTimezone());
    const justMastered = updated.mastered && !prev.mastered;

    // Vocabulary earns against the same weekly pool as passage questions —
    // one balance of gaming time, not two.
    const minutesForRep = isCorrect
      ? VOCAB_EARNING_RATES.correct
      : VOCAB_EARNING_RATES.incorrect;
    const earnedThisWeek =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      weekBalances?.reduce((sum: number, b: any) => sum + Number(b.minutes_earned), 0) ?? 0;
    const weeklyCap = DEFAULT_SETTINGS.weeklyCapMinutes;
    const minutesAwarded = Math.min(
      minutesForRep,
      Math.max(0, weeklyCap - earnedThisWeek)
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writes: PromiseLike<any>[] = [
      admin.from("vocab_attempts").insert({
        session_id: sessionId,
        student_id: user.id,
        item_id: itemId,
        word: item.word,
        answer_given: answerGiven,
        is_correct: isCorrect,
        time_spent_seconds: timeSpentSeconds ?? 0,
      }),
      admin.from("vocab_mastery").upsert(
        {
          student_id: user.id,
          word: item.word,
          ...updated,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,word" }
      ),
    ];

    if (minutesAwarded > 0) {
      const expiresAt = new Date(
        Date.now() + DEFAULT_SETTINGS.decayDays * 24 * 60 * 60 * 1000
      );
      writes.push(
        admin.from("time_balances").insert({
          student_id: user.id,
          session_id: sessionId,
          minutes_earned: minutesAwarded,
          minutes_remaining: minutesAwarded,
          expires_at: expiresAt.toISOString(),
        })
      );
    }

    // Vocab reps count toward the session's totals. That's what makes the
    // streak fire from `/api/sessions/end`, which only credits a day when
    // total_questions > 0. Reporting keeps the two modes apart by filtering
    // on sessions.mode rather than by leaving these counters at zero.
    if (session) {
      const newTotal = session.total_questions + 1;
      const newCorrect = session.correct_count + (isCorrect ? 1 : 0);
      writes.push(
        admin
          .from("sessions")
          .update({
            total_questions: newTotal,
            correct_count: newCorrect,
            accuracy: newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : null,
            minutes_earned: Number(session.minutes_earned) + minutesAwarded,
          })
          .eq("id", sessionId)
      );
    }

    await Promise.all(writes);

    return NextResponse.json({
      isCorrect,
      correctAnswer: item.correct_answer,
      explanations: item.explanations,
      word: item.word,
      definition,
      minutesAwarded,
      earnedThisWeek: earnedThisWeek + minutesAwarded,
      weeklyCap,
      mastery: {
        consecutiveCorrect: updated.consecutive_correct,
        required: VOCAB_MASTERY.consecutiveCorrectToMaster,
        mastered: updated.mastered,
        justMastered,
        nextReviewDate: updated.next_review_date,
      },
    });
  } catch (err) {
    console.error("Vocab answer error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
