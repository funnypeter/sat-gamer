import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateNewElo } from "@/lib/engine/elo";
import {
  calculateMinutesEarned,
  checkDailyCap,
  getExpirationDate,
} from "@/lib/engine/time-calculator";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { FamilySettings } from "@/lib/types/database";

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
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
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
    const eloAfter = calculateNewElo(
      eloBefore,
      question.difficulty_rating,
      isCorrect
    );

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

    // Update session totals
    const { data: session } = await admin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const newTotal = session.total_questions + 1;
    const newCorrect = session.correct_count + (isCorrect ? 1 : 0);
    const newBlockSeconds = session.block_seconds + timeSpentSeconds;

    // Check if a 15-min block is complete
    const blockMinutes = DEFAULT_SETTINGS.blockMinutes;
    const blockThreshold = blockMinutes * 60;
    let minutesAwarded = 0;
    let blockCompleted = false;
    let updatedBlockSeconds = newBlockSeconds;

    if (newBlockSeconds >= blockThreshold) {
      blockCompleted = true;
      updatedBlockSeconds = newBlockSeconds - blockThreshold;

      // Calculate accuracy for this block
      const accuracy =
        newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : 0;

      // Get family settings
      const { data: userProfile } = await admin
        .from("users")
        .select("family_id")
        .eq("id", user.id)
        .single();

      let familySettings: FamilySettings = {
        accuracyTiers: [...DEFAULT_SETTINGS.accuracyTiers],
        decayDays: DEFAULT_SETTINGS.decayDays,
        dailyCapMinutes: DEFAULT_SETTINGS.dailyCapMinutes,
        weekendBaseMinutes: DEFAULT_SETTINGS.weekendBaseMinutes,
        blockMinutes: DEFAULT_SETTINGS.blockMinutes,
      };
      if (userProfile) {
        const { data: family } = await admin
          .from("families")
          .select("settings")
          .eq("id", userProfile.family_id)
          .single();
        if (family?.settings) {
          familySettings = family.settings as unknown as FamilySettings;
        }
      }

      const rawMinutes = calculateMinutesEarned(accuracy, familySettings);

      // Check daily cap
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayBalances } = await admin
        .from("time_balances")
        .select("minutes_earned")
        .eq("student_id", user.id)
        .gte("earned_at", todayStart.toISOString());

      const earnedToday =
        todayBalances?.reduce(
          (sum, b) => sum + Number(b.minutes_earned),
          0
        ) ?? 0;

      const capResult = checkDailyCap(
        earnedToday,
        rawMinutes,
        familySettings
      );

      minutesAwarded = capResult.awarded;

      if (minutesAwarded > 0) {
        // Create time balance
        const now = new Date();
        await admin.from("time_balances").insert({
          student_id: user.id,
          session_id: sessionId,
          minutes_earned: minutesAwarded,
          minutes_remaining: minutesAwarded,
          expires_at: getExpirationDate(
            now,
            familySettings.decayDays
          ).toISOString(),
        });
      }
    }

    // Update session
    await admin
      .from("sessions")
      .update({
        total_questions: newTotal,
        correct_count: newCorrect,
        accuracy:
          newTotal > 0
            ? Math.round((newCorrect / newTotal) * 100)
            : null,
        block_seconds: updatedBlockSeconds,
        minutes_earned: Number(session.minutes_earned) + minutesAwarded,
      })
      .eq("id", sessionId);

    // Handle spaced repetition for incorrect answers
    if (!isCorrect) {
      const { data: existingSR } = await admin
        .from("spaced_repetition")
        .select("*")
        .eq("student_id", user.id)
        .eq("question_id", questionId)
        .single();

      if (existingSR) {
        // Reset interval on failure
        await admin
          .from("spaced_repetition")
          .update({
            next_review_date: new Date(
              Date.now() + 1 * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .split("T")[0],
            interval_days: 1,
            ease_factor: Math.max(1.3, Number(existingSR.ease_factor) - 0.2),
          })
          .eq("id", existingSR.id);
      } else {
        // Create new spaced repetition entry
        await admin.from("spaced_repetition").insert({
          student_id: user.id,
          question_id: questionId,
          next_review_date: new Date(
            Date.now() + 1 * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split("T")[0],
          interval_days: 1,
          ease_factor: 2.5,
          review_count: 0,
        });
      }
    } else {
      // Correct answer — increase interval if in spaced repetition
      const { data: existingSR } = await admin
        .from("spaced_repetition")
        .select("*")
        .eq("student_id", user.id)
        .eq("question_id", questionId)
        .single();

      if (existingSR) {
        const newEase = Math.min(3.0, Number(existingSR.ease_factor) + 0.1);
        const newInterval = Math.round(
          existingSR.interval_days * newEase
        );
        await admin
          .from("spaced_repetition")
          .update({
            next_review_date: new Date(
              Date.now() + newInterval * 24 * 60 * 60 * 1000
            )
              .toISOString()
              .split("T")[0],
            interval_days: newInterval,
            ease_factor: newEase,
            review_count: existingSR.review_count + 1,
          })
          .eq("id", existingSR.id);
      }
    }

    return NextResponse.json({
      isCorrect,
      correctAnswer: question.correct_answer,
      explanations: question.explanations,
      eloChange: eloAfter - eloBefore,
      newElo: eloAfter,
      blockCompleted,
      minutesAwarded,
      blockSeconds: updatedBlockSeconds,
    });
  } catch (err) {
    console.error("Answer submission error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
