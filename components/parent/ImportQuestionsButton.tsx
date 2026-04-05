"use client";

import { useState } from "react";

export default function ImportQuestionsButton({ existingCount }: { existingCount: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [count, setCount] = useState(existingCount);
  const [progress, setProgress] = useState({ imported: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState("");

  async function handleImport() {
    setStatus("loading");
    setProgress({ imported: 0, total: 0 });
    setErrorMsg("");

    let offset = 0;
    let totalImported = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetch("/api/questions/import-cb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setErrorMsg(data.error || "Import failed");
          return;
        }

        totalImported += data.imported;
        setCount(existingCount + totalImported);
        setProgress({ imported: totalImported, total: data.total });

        if (data.done || !data.nextOffset) {
          setStatus("done");
          return;
        }

        offset = data.nextOffset;
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  }

  return (
    <div className="card-glass p-6 border border-accent-green/20 bg-accent-green/5">
      <h3 className="text-lg font-semibold text-white mb-2">
        College Board Questions
      </h3>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl font-bold text-accent-green">{count}</span>
        <span className="text-sm text-gray-400">questions imported</span>
      </div>

      {count > 0 && status === "idle" && (
        <p className="text-sm text-gray-400 mb-4">
          Questions are ready. Tap below to check for new ones.
        </p>
      )}

      {count === 0 && status === "idle" && (
        <p className="text-sm text-gray-400 mb-4">
          Import real SAT questions from the College Board question bank (~1,400 questions).
        </p>
      )}

      {status === "idle" && (
        <button onClick={handleImport} className="btn-primary">
          {count > 0 ? "Check for New Questions" : "Import Questions"}
        </button>
      )}

      {status === "loading" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-accent-blue">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">
              Importing... {progress.imported} added so far
            </span>
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-navy-900/80 rounded-full h-2">
              <div
                className="bg-accent-green h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (progress.imported / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {status === "done" && (
        <div className="rounded-lg bg-accent-green/10 border border-accent-green/20 px-4 py-3 text-sm text-accent-green">
          {progress.imported > 0
            ? `Added ${progress.imported} new questions!`
            : "All questions are up to date."}
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </div>
          <button onClick={handleImport} className="btn-primary text-sm">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
