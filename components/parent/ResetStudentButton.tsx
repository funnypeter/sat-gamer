"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResetStudentButtonProps {
  studentId: string;
  studentName: string;
}

export default function ResetStudentButton({
  studentId,
  studentName,
}: ResetStudentButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  async function handleReset() {
    setIsResetting(true);
    setResult(null);

    try {
      const res = await fetch("/api/students/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });

      if (res.ok) {
        setResult("success");
        setShowConfirm(false);
        setConfirmText("");
        // Refresh the page after a short delay so the user sees the success message
        setTimeout(() => {
          router.refresh();
        }, 1500);
      } else {
        setResult("error");
      }
    } catch {
      setResult("error");
    } finally {
      setIsResetting(false);
    }
  }

  const nameMatches =
    confirmText.trim().toLowerCase() === studentName.trim().toLowerCase();

  return (
    <div className="space-y-3">
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-4 py-2 text-sm font-medium text-accent-red transition-colors hover:bg-accent-red/20"
        >
          Reset Student History
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-accent-red/30 bg-accent-red/5 p-4">
          <p className="text-sm text-gray-300">
            Are you sure? This will permanently delete all of{" "}
            <span className="font-semibold text-white">{studentName}</span>&apos;s
            practice history, earned time, and stats. This cannot be undone.
          </p>
          <div>
            <label
              htmlFor="confirm-name"
              className="block text-xs text-gray-400 mb-1"
            >
              Type <span className="font-semibold text-white">{studentName}</span> to
              confirm:
            </label>
            <input
              id="confirm-name"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-red/50 focus:outline-none focus:ring-1 focus:ring-accent-red/50"
              placeholder={studentName}
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={!nameMatches || isResetting}
              className="rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-red/80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isResetting ? "Resetting..." : "I understand, reset everything"}
            </button>
            <button
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result === "success" && (
        <p className="text-sm text-accent-green">
          Student history has been reset successfully. Refreshing...
        </p>
      )}
      {result === "error" && (
        <p className="text-sm text-accent-red">
          Failed to reset student history. Please try again.
        </p>
      )}
    </div>
  );
}
