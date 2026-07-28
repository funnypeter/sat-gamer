"use client";

import { useState } from "react";
import { BLANK } from "@/lib/vocab/blank";

export interface VocabItem {
  id: string;
  word: string;
  sentence: string;
  choices: { label: string; text: string }[];
  tier: number;
}

interface VocabCardProps {
  item: VocabItem;
  onAnswer: (label: string) => void;
  selectedAnswer: string | null;
  disabled: boolean;
  /** "review" | "new" | ... — drives the badge. */
  reason?: string;
}

const REASON_LABEL: Record<string, { text: string; className: string }> = {
  new: {
    text: "New word",
    className: "bg-accent-blue/10 text-accent-blue border border-accent-blue/20",
  },
  review: {
    text: "Review",
    className: "bg-accent-gold/10 text-accent-gold border border-accent-gold/20",
  },
  "early-review": {
    text: "Review",
    className: "bg-accent-gold/10 text-accent-gold border border-accent-gold/20",
  },
  refresher: {
    text: "Refresher",
    className: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  },
};

export default function VocabCard({
  item,
  onAnswer,
  selectedAnswer,
  disabled,
  reason,
}: VocabCardProps) {
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());

  const selectedWord =
    item.choices.find((c) => c.label === selectedAnswer)?.text ?? null;

  // Sentences are plain text, not HTML — they're model-authored prose with no
  // markup, so there's no sanitizer here and nothing is set via
  // dangerouslySetInnerHTML. If sentences ever carry markup, route them
  // through lib/sanitize.ts like QuestionCard does.
  const [before, after] = splitOnBlank(item.sentence);

  const badge = reason ? REASON_LABEL[reason] : undefined;

  function toggleEliminate(label: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEliminated((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
        if (selectedAnswer === label) onAnswer("");
      }
      return next;
    });
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center gap-2">
        <div className="badge-blue">Vocabulary</div>
        {badge && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.text}
          </span>
        )}
      </div>

      <div className="card-glass p-5">
        <p className="text-lg leading-relaxed text-gray-100">
          {before}
          {/* The chosen word appears in the blank as soon as it's tapped.
              Reading the completed sentence back is how you actually check a
              sentence-completion answer, and making the student hold the word
              in their head while they re-read tests memory, not vocabulary. */}
          <span
            className={`mx-1 inline-block min-w-[6rem] rounded-md border-b-2 px-2 pb-0.5 text-center font-semibold transition-colors ${
              selectedWord
                ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                : "border-gray-500 text-transparent"
            }`}
          >
            {selectedWord ?? " "}
          </span>
          {after}
        </p>
      </div>

      <div className="space-y-3">
        {item.choices.map((choice) => {
          const isSelected = selectedAnswer === choice.label;
          const isEliminated = eliminated.has(choice.label);
          return (
            <div key={choice.label} className="flex items-start gap-2">
              <button
                onClick={(e) => toggleEliminate(choice.label, e)}
                disabled={disabled}
                className={`mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
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

              <button
                onClick={() => !isEliminated && onAnswer(choice.label)}
                disabled={disabled || isEliminated}
                className={`flex-1 text-left rounded-xl border p-3 transition-all duration-200 ${
                  isEliminated
                    ? "border-white/5 bg-navy-800/30 opacity-40"
                    : isSelected
                    ? "border-accent-blue bg-accent-blue/10 ring-1 ring-accent-blue/50"
                    : "border-white/10 bg-navy-800/60 hover:border-white/20 hover:bg-navy-800/80"
                } ${disabled || isEliminated ? "cursor-not-allowed" : "cursor-pointer active:scale-[0.99]"}`}
              >
                <div className="flex items-center gap-3">
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
                    className={`text-base font-medium ${
                      isEliminated ? "line-through text-gray-600" : "text-gray-100"
                    }`}
                  >
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

/**
 * Split a stored sentence around its single blank. Falls back to putting the
 * whole sentence before an empty blank if the marker is somehow missing, so a
 * malformed row degrades to unanswerable-but-rendered rather than blank.
 */
function splitOnBlank(sentence: string): [string, string] {
  const i = sentence.indexOf(BLANK);
  if (i === -1) return [sentence, ""];
  return [sentence.slice(0, i), sentence.slice(i + BLANK.length)];
}
