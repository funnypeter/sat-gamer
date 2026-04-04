"use client";

import { useCallback, useRef, useState } from "react";
import { useSessionStore } from "@/stores/session-store";
import QuestionCard from "@/components/student/QuestionCard";
import FeedbackOverlay from "@/components/student/FeedbackOverlay";

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
    startSession,
    endSession,
    setCurrentQuestion,
    recordAnswer,
    dismissFeedback,
    addTimeEarned,
    setTimeEarnedToday,
  } = useSessionStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [lastEarned, setLastEarned] = useState<number | null>(null);
  const [earnedThisWeek, setEarnedThisWeek] = useState(0);
  const [sessionEarned, setSessionEarned] = useState(0);
  const answerStartTime = useRef<number>(Date.now());
  const retryCount = useRef(0);

  const fetchNextQuestion = useCallback(async () => {
    try {
      setError(null);
      const params = sessionId ? `?sessionId=${sessionId}` : "";
      const res = await fetch(`/api/questions/next${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.question) {
        setCurrentQuestion(data.question);
        setSelectedAnswer(null);
        setLastEarned(null);
        answerStartTime.current = Date.now();
        retryCount.current = 0;
      } else if (retryCount.current < 3) {
        retryCount.current++;
        setError("Generating questions... please wait.");
        setTimeout(() => fetchNextQuestion(), 5000);
      } else {
        setError("Could not generate questions. Check that GEMINI_API_KEY is configured.");
        retryCount.current = 0;
      }
    } catch {
      setError("Failed to load question.");
    }
  }, [setCurrentQuestion, sessionId]);

  async function handleStart() {
    setLoading(true);
    setError(null);
    setSessionEarned(0);

    try {
      const res = await fetch("/api/sessions/start", { method: "POST" });
      if (!res.ok) { setError("Failed to start session"); return; }

      const data = await res.json();
      startSession(data.sessionId);
      setTimeEarnedToday(data.minutesEarnedToday ?? 0);
      setEarnedThisWeek(data.minutesEarnedToday ?? 0);
      await fetchNextQuestion();
    } catch {
      setError("Failed to start session");
    } finally {
      setLoading(false);
    }
  }

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

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit answer"); return; }
      recordAnswer(data.isCorrect, data.correctAnswer, data.explanations);

      if (data.minutesAwarded > 0) {
        addTimeEarned(data.minutesAwarded);
        setLastEarned(data.minutesAwarded);
        setSessionEarned(prev => prev + data.minutesAwarded);
        setEarnedThisWeek(data.earnedThisWeek ?? 0);
      }
    } catch {
      setError("Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    dismissFeedback();
    setLastEarned(null);
    await fetchNextQuestion();
  }

  async function handleEnd() {
    if (!sessionId) return;
    try {
      await fetch("/api/sessions/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {}
    endSession();
    window.location.href = "/student-dashboard";
  }

  // Not started
  if (!isActive) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
        <div className="text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-blue/10 mx-auto">
            <svg className="h-10 w-10 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Ready to Practice?</h2>
          <p className="mt-2 text-gray-400">
            Answer questions to earn gaming time. Every question counts!
          </p>
        </div>

        {error && (
          <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button onClick={handleStart} disabled={loading} className="btn-primary text-lg px-10 py-4">
          {loading ? "Starting..." : "Start Practice"}
        </button>
      </div>
    );
  }

  // Active session
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="mx-auto max-w-md space-y-4 animate-fade-in">
      {/* Session stats bar */}
      <div className="flex items-center justify-between card-glass px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white font-semibold">{totalQuestions} <span className="text-gray-400 font-normal">answered</span></span>
          <span className="text-accent-green font-semibold">{accuracy}%</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Session earned</p>
            <p className="text-sm font-bold text-accent-blue">{sessionEarned} min</p>
          </div>
          <button onClick={handleEnd} className="text-sm text-gray-400 hover:text-accent-red transition-colors">
            End
          </button>
        </div>
      </div>

      {/* Per-question earnings notification */}
      {lastEarned !== null && showFeedback && (
        <div className={`rounded-lg px-4 py-2 text-sm font-semibold text-center animate-slide-up ${
          lastEarned >= 1.5 ? "bg-accent-gold/10 border border-accent-gold/20 text-accent-gold"
          : "bg-accent-blue/10 border border-accent-blue/20 text-accent-blue"
        }`}>
          +{lastEarned} min gaming time earned!
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
          {selectedAnswer && !showFeedback && (
            <button
              onClick={async () => { setError(null); setSelectedAnswer(null); await fetchNextQuestion(); }}
              className="block mt-2 text-accent-blue hover:underline font-semibold"
            >
              Skip to next question →
            </button>
          )}
        </div>
      )}

      {/* Question */}
      {currentQuestion && !showFeedback && (
        <>
          <QuestionCard
            question={currentQuestion}
            onAnswer={handleAnswer}
            selectedAnswer={selectedAnswer}
            disabled={submitting}
          />
          {submitting && (
            <div className="text-center py-2">
              <span className="text-sm text-gray-400 animate-pulse">Checking answer...</span>
            </div>
          )}
        </>
      )}

      {/* Feedback */}
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

      {/* Loading */}
      {!currentQuestion && !error && (
        <div className="card-glass p-8 text-center">
          <div className="animate-pulse text-gray-400">Loading question...</div>
        </div>
      )}

      {/* Weekly earning progress */}
      <div className="card-glass px-4 py-3">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>This week&apos;s earnings</span>
          <span>{earnedThisWeek} / 45 min</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-blue rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (earnedThisWeek / 45) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
