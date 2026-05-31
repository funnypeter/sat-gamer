"use client";

import { useState } from "react";
import type { QuestionChoice } from "@/lib/types/database";
import { sanitizeHtml } from "@/lib/sanitize";

interface ReviewCardProps {
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

  const givenText = choiceText(choices, answerGiven);
  const correctText = choiceText(choices, correctAnswer);

  return (
    <div className="card-glass p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-blue">
          {category}
        </span>
        <span className="text-xs text-gray-500">
          {new Date(answeredAt).toLocaleDateString()}
        </span>
      </div>

      <div
        className={`text-sm text-gray-400 ${expanded ? "[&_p]:mb-2 [&_p:last-child]:mb-0" : "line-clamp-3 [&_p]:inline"}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(passageText) }}
      />
      <div
        className="text-sm font-medium text-white"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(questionText) }}
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-semibold text-accent-blue hover:underline"
      >
        {expanded ? "Show less" : "Show full question"}
      </button>

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
    </div>
  );
}
