import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateNewElo } from "@/lib/engine/elo";
import { DEFAULT_SETTINGS, EARNING_RATES } from "@/lib/constants";
import { startOfWeekInAppTimezone } from "@/lib/date";

// NOTE: CB questions used to be re-categorized by a blocking Gemini call here,
// on the first answer to each one. That put a multi-second AI round-trip
// between "Submit" and the feedback screen. It was also redundant — the
// importer already derives the category from CB's granular skill_cd, which is
// a 1-to-1 mapping onto our 10 DSAT categories and strictly more reliable than
// asking a model to guess. Don't reintroduce it.

function getMinutesPerQuestion(isCorrect: boolean, difficultyRating: number): number {
  if (isCorrect) {
    if (difficultyRating >= 600) return EARNING_RATES.correctHard;
    if (difficultyRating >= 450) return EARNING_RATES.correctMedium;
    return EARNING_RATES.correctEasy;
  }
  return EARNING_RATES.incorrect;
}

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

    const body = await request.json();
    const { sessionId, questionId, answerGiven, timeSpentSeconds } = body as {
      sessionId: string;
      questionId: string;
      answerGiven: string;
      timeSpentSeconds: number;
    };

    // This route sits between "Submit" and the feedback screen, so every
    // round-trip here is dead time the student stares at. Independent reads
    // and writes are batched rather than awaited one at a time.
    //
    // Idempotency: if this question was already recorded in this session
    // (double-submit after a network flake, or a stale client re-showing
    // an answered question), return the recorded result instead of
    // writing a second row and double-counting stats/earnings.
    const [{ data: question }, { data: alreadyAnswered }] = await Promise.all([
      admin.from("questions").select("*").eq("id", questionId).single(),
      admin
        .from("student_questions")
        .select("is_correct")
        .eq("session_id", sessionId)
        .eq("question_id", questionId)
        .limit(1)
        .maybeSingle(),
    ]);

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (alreadyAnswered) {
      return NextResponse.json({
        isCorrect: alreadyAnswered.is_correct,
        correctAnswer: question.correct_answer,
        explanations: question.explanations,
        eloChange: 0,
        newElo: null,
        minutesAwarded: 0,
        earnedThisWeek: 0,
        weeklyCap: DEFAULT_SETTINGS.weeklyCapMinutes,
        difficulty: question.difficulty_rating >= 600 ? "hard" : question.difficulty_rating >= 450 ? "medium" : "easy",
        duplicate: true,
      });
    }

    const isCorrect = answerGiven === question.correct_answer;

    // Check weekly cap. Resets Monday at midnight Pacific — not a
    // rolling 7-day window — so a student always has a predictable
    // "fresh week" moment regardless of when they last maxed out.
    const weekStart = startOfWeekInAppTimezone();

    // Everything below depends only on the question row, so read it all at once.
    const [
      { data: existingStats },
      { data: weekBalances },
      { data: session },
      { data: existingSR },
    ] = await Promise.all([
      admin
        .from("student_stats")
        .select("*")
        .eq("student_id", user.id)
        .eq("category", question.category)
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
      isCorrect
        ? Promise.resolve({ data: null })
        : admin
            .from("spaced_repetition")
            .select("*")
            .eq("student_id", user.id)
            .eq("question_id", questionId)
            .maybeSingle(),
    ]);

    let stats = existingStats;
    if (!stats) {
      const { data: newStats } = await admin
        .from("student_stats")
        .insert({
          student_id: user.id,
          category: question.category,
          elo_rating: 500,
          total_attempted: 0,
          total_correct: 0,
        })
        .select()
        .single();
      stats = newStats;
    }

    const eloBefore = stats?.elo_rating ?? 500;
    const eloAfter = calculateNewElo(eloBefore, question.difficulty_rating, isCorrect);

    // Calculate per-question time earned
    const minutesForQuestion = getMinutesPerQuestion(isCorrect, question.difficulty_rating);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const earnedThisWeek = weekBalances?.reduce((sum: number, b: any) => sum + Number(b.minutes_earned), 0) ?? 0;
    const weeklyCap = DEFAULT_SETTINGS.weeklyCapMinutes;
    const minutesAwarded = Math.min(minutesForQuestion, Math.max(0, weeklyCap - earnedThisWeek));

    const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Every write below is independent of the others — run them together
    // rather than paying a serial round-trip for each.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writes: PromiseLike<any>[] = [
      // Record the answer
      admin.from("student_questions").insert({
        session_id: sessionId,
        student_id: user.id,
        question_id: questionId,
        answer_given: answerGiven,
        is_correct: isCorrect,
        time_spent_seconds: timeSpentSeconds,
        elo_before: eloBefore,
        elo_after: eloAfter,
      }),
      // Update student stats
      admin
        .from("student_stats")
        .update({
          elo_rating: eloAfter,
          total_attempted: (stats?.total_attempted ?? 0) + 1,
          total_correct: (stats?.total_correct ?? 0) + (isCorrect ? 1 : 0),
          last_practiced: new Date().toISOString(),
        })
        .eq("student_id", user.id)
        .eq("category", question.category),
    ];

    // Award time if any
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

    // Update session totals
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

    // Handle spaced repetition
    if (!isCorrect) {
      if (existingSR) {
        writes.push(
          admin
            .from("spaced_repetition")
            .update({
              next_review_date: tomorrow,
              interval_days: 1,
              ease_factor: Math.max(1.3, Number(existingSR.ease_factor) - 0.2),
            })
            .eq("id", existingSR.id)
        );
      } else {
        writes.push(
          admin.from("spaced_repetition").insert({
            student_id: user.id,
            question_id: questionId,
            next_review_date: tomorrow,
            interval_days: 1,
            ease_factor: 2.5,
            review_count: 0,
          })
        );
      }
    } else {
      // Correct on a review answer — retire the question from SR rotation.
      // The student already proved they know it once after the original miss,
      // so we don't keep cycling it via expanding intervals. The miss still
      // lives in student_questions, so the Review page's history is intact.
      writes.push(
        admin
          .from("spaced_repetition")
          .delete()
          .eq("student_id", user.id)
          .eq("question_id", questionId)
      );
    }

    await Promise.all(writes);

    return NextResponse.json({
      isCorrect,
      correctAnswer: question.correct_answer,
      explanations: question.explanations,
      eloChange: eloAfter - eloBefore,
      newElo: eloAfter,
      minutesAwarded,
      earnedThisWeek: earnedThisWeek + minutesAwarded,
      weeklyCap,
      difficulty: question.difficulty_rating >= 600 ? "hard" : question.difficulty_rating >= 450 ? "medium" : "easy",
    });
  } catch (err) {
    console.error("Answer submission error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
