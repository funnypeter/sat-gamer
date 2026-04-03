"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import QuestionCard from "@/components/student/QuestionCard";
import FeedbackOverlay from "@/components/student/FeedbackOverlay";
import PracticeTimer from "@/components/student/PracticeTimer";

export default function PracticePage() {
  const {
    sessionId,
    isActive,
    currentQuestion,
    showFeedback,
    lastAnswerCorrect,
    lastCorrectAnswer,
    lastExplanations,
    totalQuestions,
    correctCount,
    blockSeconds,
    startSession,
    endSession,
    setCurrentQuestion,
    recordAnswer,
    dismissFeedback,
    tickBlock,
    setBlockSeconds,
    addTimeEarned,
    setTimeEarnedToday,
  } = useSessionStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [blockCompleteMessage, setBlockCompleteMessage] = useState<string | null>(null);
  const answerStartTime = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch next question
  const fetchNextQuestion = useCallback(async () => {
    try {
      const res = await fetch("/api/questions/next");
      if (!res.ok) return;
      const data = await res.json();
      if (data.question) {
        setCurrentQuestion(data.question);
        setSelectedAnswer(null);
        answerStartTime.current = Date.now();
      } else {
        setError("No questions available. Ask a parent or admin to generate questions.");
      }
    } catch {
      setError("Failed to load question.");
    }
  }, [setCurrentQuestion]);

  // Start a new practice session
  async function handleStart() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/sessions/start", { method: "POST" });
      if (!res.ok) {
        setError("Failed to start session");
        return;
      }

      const data = await res.json();
      startSession(data.sessionId);
      setTimeEarnedToday(data.minutesEarnedToday ?? 0);

      // Start the block timer
      await fetchNextQuestion();
    } catch {
      setError("Failed to start session");
    } finally {
      setLoading(false);
    }
  }

  // Block timer tick
  useEffect(() => {
    if (isActive && !showFeedback) {
      timerRef.current = setInterval(() => {
        tickBlock();
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, showFeedback, tickBlock]);

  // Submit answer
  async function handleAnswer(answer: string) {
    if (submitting || !sessionId || !currentQuestion) return;

    setSelectedAnswer(answer);
    setSubmitting(true);

    const timeSpent = Math.round((Date.now() - answerStartTime.current) / 1000);

    try {
      const res = await fetch("/api/sessions/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.id,
          answerGiven: answer,
          timeSpentSeconds: timeSpent,
        }),
      });

      if (!res.ok) {
        setError("Failed to submit answer");
        return;
      }

      const data = await res.json();
      recordAnswer(
        data.isCorrect,
        data.correctAnswer,
        data.explanations
      );

      setBlockSeconds(data.blockSeconds);

      if (data.blockCompleted && data.minutesAwarded > 0) {
        addTimeEarned(data.minutesAwarded);
        setBlockCompleteMessage(
          `Block complete! You earned ${data.minutesAwarded} minutes of gaming time!`
        );
      }
    } catch {
      setError("Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  // Next question after feedback
  async function handleNext() {
    dismissFeedback();
    setBlockCompleteMessage(null);
    await fetchNextQuestion();
  }

  // End session
  async function handleEnd() {
    if (!sessionId) return;

    try {
      await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      // Best effort
    }

    endSession();
  }

  // Not started yet — show start screen
  if (!isActive) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
        <div className="text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-blue/10 mx-auto">
            <svg
              className="h-10 w-10 text-accent-blue"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Ready to Practice?</h2>
          <p className="mt-2 text-gray-400">
            Answer questions in 15-minute blocks to earn gaming time.
          </p>
        </div>

        {error && (
          <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          className="btn-primary text-lg px-10 py-4"
        >
          {loading ? "Starting..." : "Start Practice"}
        </button>
      </div>
    );
  }

  // Active session
  return (
    <div className="mx-auto max-w-md space-y-4 animate-fade-in">
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PracticeTimer
            blockSeconds={blockSeconds}
            blockMinutes={15}
          />
          <div>
            <p className="text-sm text-gray-400">
              {totalQuestions} answered &middot;{" "}
              <span className="text-accent-green">
                {totalQuestions > 0
                  ? Math.round((correctCount / totalQuestions) * 100)
                  : 0}
                %
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={handleEnd}
          className="text-sm text-gray-400 hover:text-accent-red transition-colors"
        >
          End Session
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Block complete notification */}
      {blockCompleteMessage && (
        <div className="rounded-lg bg-accent-gold/10 border border-accent-gold/20 px-4 py-3 text-sm text-accent-gold animate-slide-up">
          {blockCompleteMessage}
        </div>
      )}

      {/* Question */}
      {currentQuestion && !showFeedback && (
        <QuestionCard
          question={currentQuestion}
          onAnswer={handleAnswer}
          selectedAnswer={selectedAnswer}
          disabled={submitting}
        />
      )}

      {/* Feedback overlay */}
      {showFeedback && (
        <FeedbackOverlay
          isCorrect={lastAnswerCorrect ?? false}
          correctAnswer={lastCorrectAnswer ?? ""}
          selectedAnswer={selectedAnswer ?? ""}
          explanations={lastExplanations ?? {}}
          choices={currentQuestion?.choices ?? []}
          onNext={handleNext}
        />
      )}

      {/* Loading state */}
      {!currentQuestion && !error && (
        <div className="card-glass p-8 text-center">
          <div className="animate-pulse text-gray-400">
            Loading question...
          </div>
        </div>
      )}
    </div>
  );
}
