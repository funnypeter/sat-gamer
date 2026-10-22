"use client";

import { useState } from "react";
import type { Question } from "@/lib/types/database";
import { sanitizeHtml, isMetaPromptPassage } from "@/lib/sanitize";

interface QuestionCardProps {
  question: Pick<
    Question,
    "id" | "category" | "passage_text" | "question_text" | "choices"
  > &
    Partial<Pick<Question, "subject" | "answer_format">> & { source?: string };
  onAnswer: (answer: string) => void;
  /** Grid-ins: Enter in the answer box submits. */
  onSubmit?: () => void;
  selectedAnswer: string | null;
  disabled: boolean;
}

export default function QuestionCard({
  question,
  onAnswer,
  onSubmit,
  selectedAnswer,
  disabled,
}: QuestionCardProps) {
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const isMath = question.subject === "math";
  const isGridIn = question.answer_format === "spr";
  // Most math questions have no passage at all — that's normal, not the
  // meta-prompt bug, so the "missing passage" notice is verbal-only.
  const passageIsBroken = !isMath && isMetaPromptPassage(question.passage_text);
  const passageHtml = sanitizeHtml(question.passage_text ?? "");
  const hasPassage = passageHtml.replace(/<[^>]*>/g, "").trim().length > 0 || /<(table|math)/.test(passageHtml);

  function toggleEliminate(label: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEliminated((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
        // If eliminating the selected answer, deselect it
        if (selectedAnswer === label) onAnswer("");
      }
      return next;
    });
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Category & source badges */}
      <div className="flex items-center gap-2">
        <div className="badge-blue">{question.category}</div>
        {question.source && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            question.source === "College Board"
              ? "bg-accent-green/10 text-accent-green border border-accent-green/20"
              : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
          }`}>
            {question.source}
          </span>
        )}
      </div>

      {/* Passage — hidden when the row is broken (meta-prompt instead of prose) */}
      {passageIsBroken ? (
        <div className="card-glass border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            This question is missing its passage. Answer based on the question
            stem alone, or skip it.
          </p>
        </div>
      ) : hasPassage ? (
        <div className="card-glass p-4">
          <div
            className="question-html text-base leading-relaxed text-gray-100"
            dangerouslySetInnerHTML={{ __html: passageHtml }}
          />
        </div>
      ) : null}

      {/* Question. If the passage is broken, the meta-prompt stored in
          passage_text is actually the real question — prefer it over the
          (usually duplicate) question_text. */}
      <div
        className="question-html text-lg font-semibold text-white leading-relaxed"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(
            passageIsBroken ? question.passage_text : question.question_text
          ),
        }}
      />

      {/* Grid-in (math "student-produced response"): the student types it. */}
      {isGridIn && (
        <div className="card-glass p-4 space-y-2">
          <label htmlFor={`gridin-${question.id}`} className="label">
            Your answer
          </label>
          <input
            id={`gridin-${question.id}`}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={7}
            value={selectedAnswer ?? ""}
            onChange={(e) => onAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectedAnswer?.trim()) onSubmit?.();
            }}
            disabled={disabled}
            className="input-field text-center text-2xl tracking-wider"
            placeholder="e.g. 12, -3/4, .75"
          />
          <p className="text-xs text-gray-400">
            Enter a number, fraction, or decimal, like on the SAT grid-in.
          </p>
        </div>
      )}

      {/* Answer choices */}
      <div className="space-y-3">
        {question.choices.map((choice) => {
          const isSelected = selectedAnswer === choice.label;
          const isEliminated = eliminated.has(choice.label);
          return (
            <div key={choice.label} className="flex items-start gap-2">
              {/* Eliminate checkbox */}
              <button
                onClick={(e) => toggleEliminate(choice.label, e)}
                disabled={disabled}
                className={`mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                  isEliminated
                    ? "bg-red-500/20 border-red-500/50"
                    : "bg-white/10 border-white/20 hover:border-red-400/50 hover:bg-red-500/10"
                }`}
                title="Eliminate this choice"
              >
                {isEliminated ? (
                  <svg className="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <line x1="4" y1="4" x2="20" y2="20" />
                    <line x1="20" y1="4" x2="4" y2="20" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </button>

              {/* Choice button */}
              <button
                onClick={() => !isEliminated && onAnswer(choice.label)}
                disabled={disabled || isEliminated}
                className={`flex-1 text-left rounded-xl border p-4 transition-all duration-200 ${
                  isEliminated
                    ? "border-white/5 bg-navy-800/30 opacity-40"
                    : isSelected
                    ? "border-accent-blue bg-accent-blue/10 ring-1 ring-accent-blue/50"
                    : "border-white/10 bg-navy-800/60 hover:border-white/20 hover:bg-navy-800/80"
                } ${
                  disabled || isEliminated
                    ? "cursor-not-allowed"
                    : "cursor-pointer active:scale-[0.99]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      isEliminated
                        ? "bg-white/5 text-gray-600"
                        : isSelected
                        ? "bg-accent-blue text-white"
                        : "bg-white/5 text-gray-400"
                    }`}
                  >
                    {choice.label}
                  </span>
                  <span
                    className={`text-base leading-relaxed ${
                      isEliminated ? "line-through text-gray-600" : "text-gray-100"
                    }`}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(choice.text) }}
                  />
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
