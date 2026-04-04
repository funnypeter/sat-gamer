"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedeemPage() {
  const router = useRouter();
  const [availableMinutes, setAvailableMinutes] = useState(0);
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [activity, setActivity] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/redeem/balance")
      .then((r) => r.json())
      .then((data) => {
        setAvailableMinutes(data.availableMinutes ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleRedeem() {
    if (selectedMinutes > availableMinutes) {
      setError("Not enough minutes available.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/redeem/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutes: selectedMinutes,
          activity: activity || "Gaming",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to submit request");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-green/10 mx-auto">
          <svg className="h-10 w-10 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">Request Sent!</h2>
        <p className="text-gray-400">
          Your request for {selectedMinutes} minutes has been sent to your parent for approval.
        </p>
        <button onClick={() => router.push("/student-dashboard")} className="btn-primary px-8">
          Back to Home
        </button>
      </div>
    );
  }

  const options = [15, 30, 45];

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Redeem Gaming Time</h2>
        <p className="text-gray-400">Cash in your earned minutes</p>
      </div>

      <div className="card-glow p-6 text-center">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Available Balance</p>
        <p className="mt-2 text-5xl font-bold text-accent-blue">
          {loading ? "..." : availableMinutes}
          <span className="text-2xl text-gray-400 ml-1">min</span>
        </p>
      </div>

      {availableMinutes > 0 ? (
        <div className="card-glass p-6 space-y-5">
          <div>
            <label className="text-sm font-semibold text-gray-300 block mb-3">How much time?</label>
            <div className="grid grid-cols-3 gap-3">
              {options.filter(o => o <= availableMinutes).map((mins) => (
                <button
                  key={mins}
                  onClick={() => setSelectedMinutes(mins)}
                  className={`rounded-xl py-3 text-center font-bold text-lg transition-all ${
                    selectedMinutes === mins
                      ? "bg-accent-blue text-white ring-2 ring-accent-blue/50"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-300 block mb-2">What for? (optional)</label>
            <input
              type="text"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="input-field"
              placeholder="e.g., Fortnite, Minecraft..."
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleRedeem}
            disabled={submitting || selectedMinutes > availableMinutes}
            className="btn-primary w-full text-lg"
          >
            {submitting ? "Submitting..." : `Request ${selectedMinutes} Minutes`}
          </button>
        </div>
      ) : (
        <div className="card-glass p-8 text-center">
          <p className="text-gray-400">No minutes to redeem yet. Start practicing to earn gaming time!</p>
          <button onClick={() => router.push("/practice")} className="btn-primary mt-4">
            Start Practice
          </button>
        </div>
      )}
    </div>
  );
}
