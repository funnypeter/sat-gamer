"use client";

import { useState } from "react";

/**
 * Builds the vocabulary sentence bank.
 *
 * Same shape as `ImportQuestionsButton`: one HTTP request per chunk, looped
 * client-side, because a single function invocation is capped at 60s on the
 * Hobby plan and writing ~335 sentences takes far longer than that.
 *
 * `targetPerWord` is a pass number, not a batch size. Pass 1 gives every word
 * one sentence — enough to start practising the whole list. Passes 2 and 3
 * add the variants that keep a re-drilled word from showing the same sentence
 * twice. Running only pass 1 is a perfectly usable state; the student page
 * tops words up in the background as it goes.
 */
interface BuildResponse {
  inserted: number;
  attempted: number;
  rejections: Record<string, number>;
  remaining: number;
  totalWords: number;
  wordsWithItems: number;
  done: boolean;
}

export default function VocabBankButton({
  initialItemCount,
  totalWords,
}: {
  initialItemCount: number;
  totalWords: number;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [pass, setPass] = useState(1);
  const [inserted, setInserted] = useState(0);
  const [covered, setCovered] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [rejections, setRejections] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState("");

  async function build(targetPerWord: number) {
    setStatus("loading");
    setErrorMsg("");
    setInserted(0);
    setRejections({});
    setPass(targetPerWord);

    let total = 0;
    const tally: Record<string, number> = {};

    try {
      // Loop until the server reports nothing left for this pass. The guard
      // is the server's own `remaining`, not a fixed iteration count, so the
      // loop can't outrun or undershoot the real work.
      for (;;) {
        const res = await fetch("/api/vocab/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPerWord }),
        });
        const data: BuildResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || "Generation failed");

        total += data.inserted;
        setInserted(total);
        setCovered(data.wordsWithItems);
        setRemaining(data.remaining);
        for (const [reason, n] of Object.entries(data.rejections ?? {})) {
          tally[reason] = (tally[reason] ?? 0) + n;
        }
        setRejections({ ...tally });

        if (data.done || data.remaining === 0) break;
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error. Please try again.");
    }
  }

  return (
    <div className="card-glass p-6 border border-purple-500/20 bg-purple-500/5">
      <h3 className="text-lg font-semibold text-white mb-2">Vocabulary Sentences</h3>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl font-bold text-purple-400">
          {initialItemCount + inserted}
        </span>
        <span className="text-sm text-gray-400">sentences generated</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {totalWords} words on the list. Each needs at least one sentence before it
        can be drilled; three keeps it from repeating.
      </p>

      {status === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => build(1)} className="btn-primary text-sm">
            Build pass 1 (one each)
          </button>
          <button onClick={() => build(2)} className="btn-secondary text-sm">
            Pass 2
          </button>
          <button onClick={() => build(3)} className="btn-secondary text-sm">
            Pass 3
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
              Pass {pass} — {inserted} written
              {remaining !== null && `, ~${remaining} words to go`}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Keep this page open. {covered} of {totalWords} words covered so far.
          </p>
        </div>
      )}

      {status === "done" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-4 py-3 text-sm text-purple-300">
            Pass {pass} complete — {inserted} new sentences.
          </div>
          {Object.keys(rejections).length > 0 && (
            <div className="text-[11px] text-amber-400">
              skipped:{" "}
              {Object.entries(rejections)
                .map(([reason, n]) => `${reason} ×${n}`)
                .join(", ")}
            </div>
          )}
          <button onClick={() => setStatus("idle")} className="btn-secondary text-sm">
            Run another pass
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </div>
          {inserted > 0 && (
            <p className="text-xs text-gray-400">
              {inserted} sentences were written before the failure and are saved.
            </p>
          )}
          <button onClick={() => build(pass)} className="btn-primary text-sm">
            Resume
          </button>
        </div>
      )}
    </div>
  );
}
