"use client";

import { useEffect, useState } from "react";

interface QuestionStopwatchProps {
  /** Date.now() timestamp of when the current question was served. */
  startAt: number;
}

export default function QuestionStopwatch({ startAt }: QuestionStopwatchProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startAt) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = (elapsed % 60).toString().padStart(2, "0");

  return (
    <div className="flex justify-end">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1">
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l2.5 2.5M12 21a9 9 0 100-18 9 9 0 000 18z" />
        </svg>
        <span className="text-xs font-semibold tabular-nums text-gray-300">
          {minutes}:{seconds}
        </span>
      </div>
    </div>
  );
}
