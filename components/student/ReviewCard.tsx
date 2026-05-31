"use client";

import { useState } from "react";
import type { QuestionChoice } from "@/lib/types/database";
import { sanitizeHtml } from "@/lib/sanitize";
import AskGeminiChat from "./AskGeminiChat";

interface ReviewCardProps {
  questionId: string;
  category: string;
  answeredAt: string;
  passageText: string;
  questionText: string;
  choices: QuestionChoice[];
  correctAnswer: string;
  answerGiven: string;
  explanations: Record<string, string> | null;
}

function choiceText(choices: QuestionChoice[], label: string): string {
  return choices?.find((c) => c.label === label)?.text ?? "";
}

export default function ReviewCard({
  questionId,
  category,
  answeredAt,
  passageText,
  questionText,
  choices,
  correctAnswer,
  answerGiven,
  explanations,
}: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const givenText = choiceText(choices, answerGiven);
  const correctText = choiceText(choices, correctAnswer);

  return (
    <div className="card-glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-blue">
          {category}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(answeredAt).toLocaleDateString()}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse question" : "Expand question"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg leading-none text-accent-blue transition-colors hover:bg-white/10"
          >
            {expanded ? "−" : "+"}
          </button>
        </div>
      </div>

      <div
        className={`text-sm text-gray-400 ${expanded ? "[&_p]:mb-2 [&_p:last-child]:mb-0" : "line-clamp-3 [&_p]:inline"}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(passageText) }}
      />
      <div
        className={`text-sm font-medium text-white ${expanded ? "" : "line-clamp-2"}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(questionText) }}
      />

      <div className="space-y-2 text-xs">
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <span className="text-gray-400">Your answer: </span>
          <span className="text-accent-red font-semibold">{answerGiven}</span>
          {givenText && (
            <div
              className="mt-1 text-gray-300 [&_p]:inline"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(givenText) }}
            />
          )}
        </div>
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
          <span className="text-gray-400">Correct: </span>
          <span className="text-accent-green font-semibold">{correctAnswer}</span>
          {correctText && (
            <div
              className="mt-1 text-gray-300 [&_p]:inline"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(correctText) }}
            />
          )}
        </div>
      </div>

      {explanations && (
        <div className="text-xs text-gray-400 bg-white/5 rounded-lg p-3">
          <p className="font-semibold text-accent-green mb-1">
            Why {correctAnswer} is correct:
          </p>
          <div
            className="[&_p]:mb-2 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(explanations[correctAnswer] ?? ""),
            }}
          />
        </div>
      )}

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

      {chatOpen && (
        <AskGeminiChat questionId={questionId} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}
