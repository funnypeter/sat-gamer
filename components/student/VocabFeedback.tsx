"use client";

import { useState } from "react";
import { BLANK } from "@/lib/vocab/blank";
import AskGeminiChat from "./AskGeminiChat";

export interface VocabMasteryResult {
  consecutiveCorrect: number;
  required: number;
  mastered: boolean;
  justMastered: boolean;
  nextReviewDate: string | null;
}

interface VocabFeedbackProps {
  itemId: string;
  word: string;
  definition: string;
  sentence: string;
  isCorrect: boolean;
  correctAnswer: string;
  selectedAnswer: string;
  choices: { label: string; text: string }[];
  explanations: Record<string, string>;
  mastery: VocabMasteryResult;
  onNext: () => void;
}

/**
 * Post-answer screen for a vocabulary rep.
 *
 * Carries the same "Ask Gemini" tutor as `FeedbackOverlay`, pointed at
 * `/api/vocab/explain`. The definition plus a one-line note per wrong choice
 * covers the common case, but "why doesn't *this* word fit?" and "how do I
 * remember this?" are exactly the questions a static gloss can't answer — and
 * a word you can't yet feel the shape of needs a second angle more than a
 * comprehension question does. The chat is opt-in, so it costs nothing on the
 * reps where the student just taps Next.
 */
export default function VocabFeedback({
  itemId,
  word,
  definition,
  sentence,
  isCorrect,
  correctAnswer,
  selectedAnswer,
  choices,
  explanations,
  mastery,
  onNext,
}: VocabFeedbackProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const completed = sentence.replace(BLANK, word);

  const chosenWord = choices.find((c) => c.label === selectedAnswer)?.text;

  // Tailor the quick-prompts to what actually happened. On a miss, the most
  // useful question is almost always the contrast between the word they
  // picked and the right one, so offer it with both words named.
  const chatSuggestions = isCorrect
    ? [
        `How would I use "${word}" myself?`,
        "Why don't the other words fit?",
        `What's a good way to remember "${word}"?`,
      ]
    : [
        chosenWord && chosenWord !== word
          ? `What's the difference between "${chosenWord}" and "${word}"?`
          : "Why is my answer wrong?",
        `Can you explain "${word}" a different way?`,
        `What's a good way to remember "${word}"?`,
      ];

  return (
    <div className="space-y-4 animate-slide-up">
      <div
        className={`rounded-xl p-4 text-center ${
          isCorrect
            ? "bg-accent-green/10 border border-accent-green/20"
            : "bg-accent-red/10 border border-accent-red/20"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {isCorrect ? (
            <svg className="h-6 w-6 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-6 w-6 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className={`text-lg font-bold ${isCorrect ? "text-accent-green" : "text-accent-red"}`}>
            {isCorrect ? "Correct!" : "Incorrect"}
          </span>
        </div>
      </div>

      {/* The word, its definition, and the sentence read back complete. Seeing
          the finished sentence is the thing that makes the meaning stick —
          more than the gloss does. */}
      <div className="card-glass p-5 space-y-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold text-white">{word}</span>
          {definition && <span className="text-sm text-gray-400">— {definition}</span>}
        </div>
        <p className="text-base leading-relaxed text-gray-300">
          {completed.split(word).map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && (
                <span className="font-semibold text-accent-blue">{word}</span>
              )}
            </span>
          ))}
        </p>
      </div>

      {/* Mastery progress. A word retires after `required` consecutive correct
          answers on separate days, so the dots are the student's read on how
          close it is to being done with. */}
      <div className="card-glass px-4 py-3">
        {mastery.justMastered ? (
          <p className="text-sm font-semibold text-accent-gold text-center">
            Mastered — <span className="font-normal text-gray-400">{word} is off your list</span>
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Progress on this word</span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: mastery.required }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full ${
                    i < mastery.consecutiveCorrect ? "bg-accent-green" : "bg-white/15"
                  }`}
                />
              ))}
              <span className="ml-1.5 text-xs text-gray-500">
                {mastery.consecutiveCorrect}/{mastery.required}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {choices.map((choice) => {
          const isCorrectChoice = choice.label === correctAnswer;
          const isSelectedChoice = choice.label === selectedAnswer;

          let borderClass = "border-white/5 bg-navy-800/40";
          if (isCorrectChoice) borderClass = "border-accent-green/30 bg-accent-green/5";
          else if (isSelectedChoice) borderClass = "border-accent-red/30 bg-accent-red/5";

          return (
            <div key={choice.label} className={`rounded-xl border p-3 ${borderClass}`}>
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isCorrectChoice
                      ? "bg-accent-green text-white"
                      : isSelectedChoice
                      ? "bg-accent-red text-white"
                      : "bg-white/5 text-gray-500"
                  }`}
                >
                  {choice.label}
                </span>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-200">{choice.text}</p>
                  {explanations[choice.label] && (
                    <p className="text-xs text-gray-400 italic">
                      {explanations[choice.label]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Available whether they got it right or wrong — "how do I actually use
          this word?" is worth asking after a correct guess too. */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-sm font-semibold text-accent-blue transition-colors hover:bg-accent-blue/20"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l2.4 6.9L21 11l-6.6 2.1L12 20l-2.4-6.9L3 11l6.6-2.1z" />
        </svg>
        Ask Gemini for help
      </button>

      <button onClick={onNext} className="btn-primary w-full">
        Next Word
      </button>

      {chatOpen && (
        <AskGeminiChat
          endpoint="/api/vocab/explain"
          payload={{ itemId }}
          subtitle={`AI tutor · ${word}`}
          suggestions={chatSuggestions}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
