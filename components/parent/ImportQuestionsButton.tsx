"use client";

import { useState } from "react";

export default function ImportQuestionsButton({ existingCount }: { existingCount: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [count, setCount] = useState(existingCount);
  const [imported, setImported] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleImport() {
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/questions/import-cb", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Import failed");
        return;
      }

      setImported(data.imported);
      setCount(existingCount + data.imported);
      setStatus("done");
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

      {status === "idle" && (
        <button onClick={handleImport} className="btn-primary">
          {count > 0 ? "Check for New Questions" : "Import Questions"}
        </button>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-3 text-accent-blue">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Importing...</span>
        </div>
      )}

      {status === "done" && (
        <div className="rounded-lg bg-accent-green/10 border border-accent-green/20 px-4 py-3 text-sm text-accent-green">
          {imported > 0
            ? `Added ${imported} questions!`
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
