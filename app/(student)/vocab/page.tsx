"use client";

import { useCallback, useRef, useState } from "react";
import { useVocabStore } from "@/stores/vocab-store";
import VocabCard from "@/components/student/VocabCard";
import VocabFeedback from "@/components/student/VocabFeedback";

interface Progress {
  mastered: number;
  inProgress: number;
  total: number;
}

export default function VocabPage() {
  const {
    sessionId,
    isActive,
    totalAnswered,
    correctCount,
    masteredThisSession,
    currentItem,
    currentReason,
    showFeedback,
    lastResult,
    startSession,
    endSession,
    setCurrentItem,
    recordAnswer,
    dismissFeedback,
  } = useVocabStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [lastEarned, setLastEarned] = useState<number | null>(null);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const answerStartTime = useRef<number>(Date.now());
  const buildAttempts = useRef(0);

  const fetchNext = useCallback(async () => {
    try {
      setError(null);
      // Clear the outgoing item BEFORE fetching, so a failed fetch can't
      // leave an already-answered item on screen and answerable.
      setCurrentItem(null);
      setSelectedAnswer(null);

      const res = await fetch("/api/vocab/next");
      if (!res.ok) {
        setError("Failed to load the next word.");
        return;
      }
      const data = await res.json();
      if (data.progress) setProgress(data.progress);

      if (data.item) {
        setCurrentItem(data.item, data.reason ?? null);
        setSelectedAnswer(null);
        setLastEarned(null);
        answerStartTime.current = Date.now();
        buildAttempts.current = 0;
        setBuilding(false);

        // Top up thin words in the background so the next few reps have a
        // fresh sentence waiting. Fire-and-forget: never block the student on
        // a generation call.
        if (Array.isArray(data.topUp) && data.topUp.length > 0) {
          fetch("/api/vocab/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ words: data.topUp, targetPerWord: 3 }),
          }).catch(() => {});
        }
        return;
      }

      if (data.needsGeneration && buildAttempts.current < 3) {
        // No sentence exists yet for any word he's due to see. Build the
        // exact words the selector wanted, then retry.
        buildAttempts.current++;
        setBuilding(true);
        await fetch("/api/vocab/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: data.wordsToGenerate ?? [],
            targetPerWord: 1,
          }),
        }).catch(() => {});
        await fetchNext();
        return;
      }

      setBuilding(false);
      setError(
        "Couldn't build vocabulary questions. Ask a parent to run the word bank builder in Settings."
      );
    } catch {
      setError("Failed to load the next word.");
    }
  }, [setCurrentItem]);

  async function handleStart() {
    setLoading(true);
    setError(null);
    setSessionEarned(0);
    try {
      const res = await fetch("/api/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "vocab" }),
      });
      if (!res.ok) {
        setError("Failed to start session");
        return;
      }
      const data = await res.json();
      startSession(data.sessionId);
      await fetchNext();
    } catch {
      setError("Failed to start session");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswer(label: string) {
    if (submitting || !sessionId || !currentItem) return;
    setSelectedAnswer(label);
    setSubmitting(true);

    const timeSpent = Math.round((Date.now() - answerStartTime.current) / 1000);

    try {
      const res = await fetch("/api/vocab/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          itemId: currentItem.id,
          answerGiven: label,
          timeSpentSeconds: timeSpent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit answer");
        return;
      }

      recordAnswer({
        isCorrect: data.isCorrect,
        correctAnswer: data.correctAnswer,
        explanations: data.explanations ?? {},
        word: data.word,
        definition: data.definition ?? "",
        mastery: data.mastery,
      });

      if (data.minutesAwarded > 0) {
        setLastEarned(data.minutesAwarded);
        setSessionEarned((prev) => prev + data.minutesAwarded);
      }
      if (data.mastery?.justMastered && progress) {
        setProgress({ ...progress, mastered: progress.mastered + 1 });
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
    await fetchNext();
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

  // ─── Not started ───────────────────────────────────────────────
  if (!isActive) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
        <div className="text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/10 mx-auto">
            <svg className="h-10 w-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Vocabulary Drill</h2>
          <p className="mt-2 text-gray-400">
            One word at a time, in a real sentence. Get a word right three
            times and it&apos;s yours for good.
          </p>
        </div>

        {error && (
          <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button onClick={handleStart} disabled={loading} className="btn-primary text-lg px-10 py-4">
          {loading ? "Starting..." : "Start Drilling"}
        </button>
      </div>
    );
  }

  // ─── Active session ────────────────────────────────────────────
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  return (
    <div className="mx-auto max-w-md space-y-4 animate-fade-in">
      <div className="flex items-center justify-between card-glass px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white font-semibold">
            {totalAnswered} <span className="text-gray-400 font-normal">words</span>
          </span>
          <span className="text-accent-green font-semibold">{accuracy}%</span>
          {masteredThisSession > 0 && (
            <span className="text-accent-gold font-semibold">
              +{masteredThisSession} mastered
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Earned</p>
            <p className="text-sm font-bold text-accent-blue">
              {Math.round(sessionEarned * 100) / 100} min
            </p>
          </div>
          <button
            onClick={handleEnd}
            className="px-4 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            End
          </button>
        </div>
      </div>

      {lastEarned !== null && showFeedback && (
        <div className="rounded-lg px-4 py-2 text-sm font-semibold text-center animate-slide-up bg-accent-blue/10 border border-accent-blue/20 text-accent-blue">
          +{lastEarned} min gaming time earned!
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
          {!currentItem && !showFeedback && (
            <button
              onClick={() => fetchNext()}
              className="block mt-2 text-accent-blue hover:underline font-semibold"
            >
              Try again →
            </button>
          )}
        </div>
      )}

      {currentItem && !showFeedback && (
        <>
          <VocabCard
            item={currentItem}
            onAnswer={(label) => setSelectedAnswer(label)}
            selectedAnswer={selectedAnswer}
            disabled={submitting}
            reason={currentReason ?? undefined}
          />
          {selectedAnswer && !submitting && (
            <button onClick={() => handleAnswer(selectedAnswer)} className="btn-primary w-full text-lg">
              Submit Answer
            </button>
          )}
          {submitting && (
            <div className="text-center py-2">
              <span className="text-sm text-gray-400 animate-pulse">Checking answer...</span>
            </div>
          )}
        </>
      )}

      {showFeedback && lastResult && currentItem && (
        <VocabFeedback
          word={lastResult.word}
          definition={lastResult.definition}
          sentence={currentItem.sentence}
          isCorrect={lastResult.isCorrect}
          correctAnswer={lastResult.correctAnswer}
          selectedAnswer={selectedAnswer ?? ""}
          choices={currentItem.choices}
          explanations={lastResult.explanations}
          mastery={lastResult.mastery}
          onNext={handleNext}
        />
      )}

      {!currentItem && !error && (
        <div className="card-glass p-8 text-center">
          <div className="animate-pulse text-gray-400">
            {building ? "Writing new sentences for these words..." : "Loading word..."}
          </div>
          {building && (
            <p className="mt-2 text-xs text-gray-500">
              This only happens the first time a word comes up.
            </p>
          )}
        </div>
      )}

      {progress && (
        <div className="card-glass px-4 py-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Words mastered</span>
            <span>
              {progress.mastered} / {progress.total}
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-gold rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (progress.mastered / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
