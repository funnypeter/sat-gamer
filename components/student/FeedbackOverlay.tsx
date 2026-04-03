"use client";

import type { QuestionChoice } from "@/lib/types/database";

interface FeedbackOverlayProps {
  isCorrect: boolean;
  correctAnswer: string;
  selectedAnswer: string;
  explanations: Record<string, string>;
  choices: QuestionChoice[];
  onNext: () => void;
}

export default function FeedbackOverlay({
  isCorrect,
  correctAnswer,
  selectedAnswer,
  explanations,
  choices,
  onNext,
}: FeedbackOverlayProps) {
  return (
    <div className="space-y-4 animate-slide-up">
      {/* Result banner */}
      <div
        className={`rounded-xl p-4 text-center ${
          isCorrect
            ? "bg-accent-green/10 border border-accent-green/20"
            : "bg-accent-red/10 border border-accent-red/20"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {isCorrect ? (
            <svg
              className="h-6 w-6 text-accent-green"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="h-6 w-6 text-accent-red"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          <span
            className={`text-lg font-bold ${
              isCorrect ? "text-accent-green" : "text-accent-red"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </span>
        </div>
        {!isCorrect && (
          <p className="mt-1 text-sm text-gray-400">
            The correct answer is{" "}
            <span className="font-bold text-accent-green">
              {correctAnswer}
            </span>
          </p>
        )}
      </div>

      {/* Answer breakdown */}
      <div className="space-y-3">
        {choices.map((choice) => {
          const isCorrectChoice = choice.label === correctAnswer;
          const isSelectedChoice = choice.label === selectedAnswer;

          let borderClass = "border-white/5 bg-navy-800/40";
          if (isCorrectChoice) {
            borderClass =
              "border-accent-green/30 bg-accent-green/5";
          } else if (isSelectedChoice && !isCorrectChoice) {
            borderClass = "border-accent-red/30 bg-accent-red/5";
          }

          return (
            <div
              key={choice.label}
              className={`rounded-xl border p-4 ${borderClass}`}
            >
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
                  <p className="text-sm text-gray-200">{choice.text}</p>
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

      {/* Next button */}
      <button onClick={onNext} className="btn-primary w-full">
        Next Question
      </button>
    </div>
  );
}
