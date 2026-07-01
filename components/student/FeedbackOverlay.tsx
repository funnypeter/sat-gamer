"use client";

import { useState } from "react";
import type { QuestionChoice } from "@/lib/types/database";
import { sanitizeHtml } from "@/lib/sanitize";
import { splitCbRationale } from "@/lib/cb-rationale";
import AskGeminiChat from "./AskGeminiChat";

interface FeedbackOverlayProps {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: string;
  selectedAnswer: string;
  explanations: Record<string, string>;
  choices: QuestionChoice[];
  onNext: () => void;
}

export default function FeedbackOverlay({
  questionId,
  isCorrect,
  correctAnswer,
  selectedAnswer,
  explanations,
  choices,
  onNext,
}: FeedbackOverlayProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const perChoiceExplanations = splitCbRationale(explanations);

  // Tailor the chat quick-prompts to whether they got it right — asking
  // "why is my answer wrong?" makes no sense on a correct answer.
  const chatSuggestions = isCorrect
    ? [
        "Why is the correct answer right?",
        "What is this question really testing?",
        "How could I have solved this faster?",
      ]
    : [
        "Can you explain this more simply?",
        "Why is my answer wrong?",
        "What is this question really testing?",
      ];
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
                  <p
                    className="text-sm text-gray-200"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(choice.text) }}
                  />
                  {perChoiceExplanations[choice.label] && (
                    <div
                      className="text-xs text-gray-400 italic [&_p]:mb-2 [&_p:last-child]:mb-0"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(perChoiceExplanations[choice.label]),
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ask Gemini — available whether the answer was right or wrong */}
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

      {/* Next button */}
      <button onClick={onNext} className="btn-primary w-full">
        Next Question
      </button>

      {chatOpen && (
        <AskGeminiChat
          questionId={questionId}
          suggestions={chatSuggestions}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
