"use client";

import { useState } from "react";
import type { Question } from "@/lib/types/database";

/** Sanitize HTML to only allow safe formatting tags.
 *  - u/b/i/em/strong/br: inline formatting
 *  - p: College Board passages wrap each paragraph in <p>
 *  - sup/sub: footnote markers and chemical formulas
 */
function sanitizeHtml(html: string): string {
  return html.replace(/<\/?(?!\/?(u|b|i|em|strong|br|p|sup|sub)\b)[^>]*>/gi, "");
}

/**
 * Detects when passage_text was filled with a meta-description of the passage
 * (e.g. "The author of this passage wants to...") instead of actual passage
 * prose. When that happens we hide the broken passage card so the user sees
 * one coherent question instead of two stacked stems with no source text.
 */
function isMetaPromptPassage(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  const patterns: RegExp[] = [
    /\bthe author of (this|the) passage\b/i,
    /\bthe (writer|author|speaker) (wants|aims|intends|seeks)\b/i,
    /\bthis passage (is about|describes|discusses|argues|explains)\b/i,
    /\bwhat is the most likely reason\b/i,
  ];
  return patterns.some((re) => re.test(t));
}

interface QuestionCardProps {
  question: Pick<
    Question,
    "id" | "category" | "passage_text" | "question_text" | "choices"
  > & { source?: string };
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
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const passageIsBroken = isMetaPromptPassage(question.passage_text);

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
      ) : (
        <div className="card-glass p-4">
          <p
            className="text-base leading-relaxed text-gray-100"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.passage_text) }}
          />
        </div>
      )}

      {/* Question. If the passage is broken, the meta-prompt stored in
          passage_text is actually the real question — prefer it over the
          (usually duplicate) question_text. */}
      <p
        className="text-lg font-semibold text-white leading-relaxed"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(
            passageIsBroken ? question.passage_text : question.question_text
          ),
        }}
      />

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
                  <span className={`text-base leading-relaxed ${
                    isEliminated ? "line-through text-gray-600" : "text-gray-100"
                  }`}>
                    {choice.text}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
