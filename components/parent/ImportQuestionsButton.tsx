"use client";

import { useState } from "react";

const DOMAINS = [
  { code: "INI", label: "Information & Ideas" },
  { code: "CAS", label: "Craft & Structure" },
  { code: "EOI", label: "Expression of Ideas" },
  { code: "SEC", label: "Standard English Conventions" },
] as const;

type DomainCode = (typeof DOMAINS)[number]["code"];

interface DomainResult {
  inserted: number;
  fetched: number;
  failedFetches: number;
  rejections: Record<string, number>;
}

export default function ImportQuestionsButton({ existingCount }: { existingCount: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [count, setCount] = useState(existingCount);
  const [purge, setPurge] = useState(false);
  const [currentDomain, setCurrentDomain] = useState<DomainCode | null>(null);
  const [results, setResults] = useState<Record<string, DomainResult>>({});
  const [errorMsg, setErrorMsg] = useState("");

  async function importDomain(
    domain: DomainCode,
    purgeFirst: boolean
  ): Promise<DomainResult> {
    const res = await fetch("/api/questions/import-cb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, purge: purgeFirst }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Import failed for ${domain}`);
    }
    return {
      inserted: data.inserted ?? 0,
      fetched: data.fetched ?? 0,
      failedFetches: data.failedFetches ?? 0,
      rejections: data.rejections ?? {},
    };
  }

  async function handleImport() {
    setStatus("loading");
    setErrorMsg("");
    setResults({});

    let totalInserted = purge ? 0 : count;
    let purgeRemaining = purge;

    try {
      for (const { code } of DOMAINS) {
        setCurrentDomain(code);
        const result = await importDomain(code, purgeRemaining);
        purgeRemaining = false; // only purge on the first call
        setResults((prev) => ({ ...prev, [code]: result }));
        totalInserted += result.inserted;
        setCount(totalInserted);
      }
      setCurrentDomain(null);
      setStatus("done");
    } catch (err) {
      setCurrentDomain(null);
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error. Please try again.");
    }
  }

  const totalInsertedThisRun = Object.values(results).reduce(
    (sum, r) => sum + r.inserted,
    0
  );

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
        <div className="space-y-3">
          {existingCount > 0 && (
            <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={purge}
                onChange={(e) => setPurge(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-white">
                  Delete existing College Board questions first
                </span>
                <br />
                <span className="text-gray-400">
                  Use this once to wipe old PineSAT-sourced rows and re-import from the official source.
                </span>
              </span>
            </label>
          )}
          <button onClick={handleImport} className="btn-primary">
            {count > 0 && !purge
              ? "Check for New Questions"
              : purge
              ? "Purge & Re-import All"
              : "Import All Questions"}
          </button>
        </div>
      )}

      {status === "loading" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-accent-blue">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">
              Importing {currentDomain ? DOMAINS.find((d) => d.code === currentDomain)?.label : "..."}
            </span>
          </div>
          <ul className="text-xs text-gray-400 space-y-1 pl-8">
            {DOMAINS.map(({ code, label }) => {
              const r = results[code];
              const isCurrent = currentDomain === code;
              const isDone = !!r;
              return (
                <li key={code} className="flex items-start gap-2">
                  <span>
                    {isDone ? "✓" : isCurrent ? "…" : "·"}
                  </span>
                  <span className={isDone ? "text-accent-green" : isCurrent ? "text-accent-blue" : ""}>
                    {label}
                    {isDone && ` — ${r.inserted} added (fetched ${r.fetched}, failed ${r.failedFetches})`}
                    {isDone && Object.keys(r.rejections).length > 0 && (
                      <div className="text-amber-400 text-[11px] mt-0.5 pl-2">
                        rejected:{" "}
                        {Object.entries(r.rejections)
                          .map(([reason, n]) => `${reason} ×${n}`)
                          .join(", ")}
                      </div>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {status === "done" && (
        <div className="rounded-lg bg-accent-green/10 border border-accent-green/20 px-4 py-3 text-sm text-accent-green">
          {totalInsertedThisRun > 0
            ? `Added ${totalInsertedThisRun} questions across ${Object.keys(results).length} domains.`
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
