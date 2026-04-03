"use client";

import type { Question } from "@/lib/types/database";

interface QuestionCardProps {
  question: Pick<
    Question,
    "id" | "category" | "passage_text" | "question_text" | "choices"
  >;
  onAnswer: (answer: string) => void;
  selectedAnswer: string | null;
  disabled: boolean;
}

export default function QuestionCard({
  question,
  onAnswer,
  selectedAnswer,
  disabled,
}: QuestionCardProps) {
  return (
    <div className="space-y-4 animate-slide-up">
      {/* Category badge */}
      <div className="badge-blue">{question.category}</div>

      {/* Passage */}
      <div className="card-glass p-4">
        <p className="text-sm leading-relaxed text-gray-300">
          {question.passage_text}
        </p>
      </div>

      {/* Question */}
      <p className="text-base font-medium text-white leading-relaxed">
        {question.question_text}
      </p>

      {/* Answer choices */}
      <div className="space-y-3">
        {question.choices.map((choice) => {
          const isSelected = selectedAnswer === choice.label;
          return (
            <button
              key={choice.label}
              onClick={() => onAnswer(choice.label)}
              disabled={disabled || selectedAnswer !== null}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
                isSelected
                  ? "border-accent-blue bg-accent-blue/10 ring-1 ring-accent-blue/50"
                  : "border-white/10 bg-navy-800/60 hover:border-white/20 hover:bg-navy-800/80"
              } ${
                disabled || selectedAnswer !== null
                  ? "cursor-not-allowed opacity-75"
                  : "cursor-pointer active:scale-[0.99]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isSelected
                      ? "bg-accent-blue text-white"
                      : "bg-white/5 text-gray-400"
                  }`}
                >
                  {choice.label}
                </span>
                <span className="text-sm text-gray-200 leading-relaxed">
                  {choice.text}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
