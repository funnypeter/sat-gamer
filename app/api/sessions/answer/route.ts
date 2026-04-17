import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateNewElo } from "@/lib/engine/elo";
import { DEFAULT_SETTINGS, EARNING_RATES, DSAT_CATEGORIES } from "@/lib/constants";
import { getGeminiModel } from "@/lib/gemini/client";
import { startOfWeekInAppTimezone } from "@/lib/date";

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

    // Fetch the question
    const { data: question } = await admin
      .from("questions")
      .select("*")
      .eq("id", questionId)
      .single();

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Reclassify CB questions on first answer (one-time Gemini call)
    if (question.generated_by === "collegeboard") {
      try {
        const model = getGeminiModel();
        const categoryList = DSAT_CATEGORIES.join(", ");
        const prompt = `Classify this Digital SAT Reading & Writing question into exactly one category.

Categories: ${categoryList}

Passage: ${(question.passage_text as string).substring(0, 500)}
Question: ${question.question_text}

Reply with ONLY the category name, nothing else.`;

        const result = await model.generateContent(prompt);
        const classified = result.response.text().trim();
        const match = DSAT_CATEGORIES.find((c) => c === classified);
        if (match) {
          question.category = match;
        }
        await admin
          .from("questions")
          .update({ category: question.category, generated_by: "collegeboard-classified" })
          .eq("id", questionId);
      } catch {
        // Classification failed — use the keyword-based category as-is
      }
    }

    const isCorrect = answerGiven === question.correct_answer;

    // Get or create student stats for this category
    let { data: stats } = await admin
      .from("student_stats")
      .select("*")
      .eq("student_id", user.id)
      .eq("category", question.category)
      .single();

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

    // Record the answer
    await admin.from("student_questions").insert({
      session_id: sessionId,
      student_id: user.id,
      question_id: questionId,
      answer_given: answerGiven,
      is_correct: isCorrect,
      time_spent_seconds: timeSpentSeconds,
      elo_before: eloBefore,
      elo_after: eloAfter,
    });

    // Update student stats
    await admin
      .from("student_stats")
      .update({
        elo_rating: eloAfter,
        total_attempted: (stats?.total_attempted ?? 0) + 1,
        total_correct: (stats?.total_correct ?? 0) + (isCorrect ? 1 : 0),
        last_practiced: new Date().toISOString(),
      })
      .eq("student_id", user.id)
      .eq("category", question.category);

    // Calculate per-question time earned
    const minutesForQuestion = getMinutesPerQuestion(isCorrect, question.difficulty_rating);

    // Check weekly cap. Resets Monday at midnight Pacific — not a
    // rolling 7-day window — so a student always has a predictable
    // "fresh week" moment regardless of when they last maxed out.
    const weekStart = startOfWeekInAppTimezone();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: weekBalances } = await admin
      .from("time_balances")
      .select("minutes_earned")
      .eq("student_id", user.id)
      .gte("earned_at", weekStart.toISOString());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const earnedThisWeek = weekBalances?.reduce((sum: number, b: any) => sum + Number(b.minutes_earned), 0) ?? 0;
    const weeklyCap = DEFAULT_SETTINGS.weeklyCapMinutes;
    const minutesAwarded = Math.min(minutesForQuestion, Math.max(0, weeklyCap - earnedThisWeek));

    // Award time if any
    if (minutesAwarded > 0) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + DEFAULT_SETTINGS.decayDays * 24 * 60 * 60 * 1000);
      await admin.from("time_balances").insert({
        student_id: user.id,
        session_id: sessionId,
        minutes_earned: minutesAwarded,
        minutes_remaining: minutesAwarded,
        expires_at: expiresAt.toISOString(),
      });
    }

    // Update session totals
    const { data: session } = await admin
      .from("sessions")
      .select("total_questions, correct_count, minutes_earned")
      .eq("id", sessionId)
      .single();

    if (session) {
      const newTotal = session.total_questions + 1;
      const newCorrect = session.correct_count + (isCorrect ? 1 : 0);
      await admin
        .from("sessions")
        .update({
          total_questions: newTotal,
          correct_count: newCorrect,
          accuracy: newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : null,
          minutes_earned: Number(session.minutes_earned) + minutesAwarded,
        })
        .eq("id", sessionId);
    }

    // Handle spaced repetition
    if (!isCorrect) {
      const { data: existingSR } = await admin
        .from("spaced_repetition")
        .select("*")
        .eq("student_id", user.id)
        .eq("question_id", questionId)
        .single();

      if (existingSR) {
        await admin.from("spaced_repetition").update({
          next_review_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          interval_days: 1,
          ease_factor: Math.max(1.3, Number(existingSR.ease_factor) - 0.2),
        }).eq("id", existingSR.id);
      } else {
        await admin.from("spaced_repetition").insert({
          student_id: user.id,
          question_id: questionId,
          next_review_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          interval_days: 1,
          ease_factor: 2.5,
          review_count: 0,
        });
      }
    } else {
      const { data: existingSR } = await admin
        .from("spaced_repetition")
        .select("*")
        .eq("student_id", user.id)
        .eq("question_id", questionId)
        .single();

      if (existingSR) {
        const newEase = Math.min(3.0, Number(existingSR.ease_factor) + 0.1);
        const newInterval = Math.round(existingSR.interval_days * newEase);
        await admin.from("spaced_repetition").update({
          next_review_date: new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          interval_days: newInterval,
          ease_factor: newEase,
          review_count: existingSR.review_count + 1,
        }).eq("id", existingSR.id);
      }
    }

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
