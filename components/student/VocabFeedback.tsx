"use client";

import { BLANK } from "@/lib/vocab/blank";

export interface VocabMasteryResult {
  consecutiveCorrect: number;
  required: number;
  mastered: boolean;
  justMastered: boolean;
  nextReviewDate: string | null;
}

interface VocabFeedbackProps {
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
 * Deliberately lighter than `FeedbackOverlay`: no "Ask Gemini" chat. The
 * tutor exists because a College Board rationale about a 400-word passage can
 * fail to land and there's genuinely more to say. A four-choice word item has
 * a definition and one line per wrong choice — that *is* the whole
 * explanation, and an AI round-trip on top of it would add several seconds to
 * a rep that should take fifteen.
 */
export default function VocabFeedback({
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
  const completed = sentence.replace(BLANK, word);

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

      <button onClick={onNext} className="btn-primary w-full">
        Next Word
      </button>
    </div>
  );
}
