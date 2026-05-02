"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatMinutes } from "@/lib/constants";

export default function RedeemPage() {
  const router = useRouter();
  const [availableMinutes, setAvailableMinutes] = useState(0);
  const [selectedMinutes, setSelectedMinutes] = useState(15);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/redeem/balance")
      .then((r) => r.json())
      .then((data) => {
        const avail = Math.round(Number(data.availableMinutes ?? 0) * 100) / 100;
        setAvailableMinutes(avail);
        setSelectedMinutes(Math.min(15, avail));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleRedeem() {
    if (selectedMinutes > availableMinutes || selectedMinutes <= 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/redeem/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: selectedMinutes, activity: "Gaming" }),
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
          Your request for {formatMinutes(selectedMinutes)} minutes has been sent for approval.
        </p>
        <button onClick={() => router.push("/student-dashboard")} className="btn-primary px-8">
          Back to Home
        </button>
      </div>
    );
  }

  // Calculate dial rotation (0-270 degrees for the arc)
  const maxMin = Math.max(1, availableMinutes);
  const pct = selectedMinutes / maxMin;
  const angle = pct * 270; // 270 degree arc
  const radius = 100;
  const cx = 120;
  const cy = 120;
  const startAngle = 135; // start from bottom-left
  const endAngle = startAngle + angle;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);
  const largeArc = angle > 180 ? 1 : 0;

  // Background arc (full 270)
  const bgEndAngle = startAngle + 270;
  const bgEndRad = (bgEndAngle * Math.PI) / 180;
  const bx2 = cx + radius * Math.cos(bgEndRad);
  const by2 = cy + radius * Math.sin(bgEndRad);

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Redeem Gaming Time</h2>
        <p className="text-gray-400">Cash in your earned minutes</p>
      </div>

      {availableMinutes > 0 ? (
        <div className="space-y-6">
          {/* Dial */}
          <div className="flex flex-col items-center">
            <div className="relative w-[240px] h-[240px]">
              <svg viewBox="0 0 240 240" className="w-full h-full">
                {/* Background track */}
                <path
                  d={`M ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${bx2} ${by2}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
                {/* Active arc */}
                {selectedMinutes > 0 && (
                  <path
                    d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="16"
                    strokeLinecap="round"
                  />
                )}
                {/* Thumb */}
                <circle cx={x2} cy={y2} r="12" fill="#3b82f6" stroke="#0f172a" strokeWidth="4" />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold text-white">{formatMinutes(selectedMinutes)}</span>
                <span className="text-sm text-gray-400">minutes</span>
              </div>
            </div>

            {/* Slider input (hidden visual, controls the value) */}
            <input
              type="range"
              min={0.25}
              max={availableMinutes}
              step={0.25}
              value={selectedMinutes}
              onChange={(e) => setSelectedMinutes(parseFloat(e.target.value))}
              className="w-48 mt-2 accent-blue-500"
              style={{ accentColor: "#3b82f6" }}
            />
            <div className="flex justify-between w-48 text-xs text-gray-500 mt-1">
              <span>0.25 min</span>
              <span>{formatMinutes(availableMinutes)} min</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleRedeem}
            disabled={submitting || selectedMinutes <= 0}
            className="btn-primary w-full text-lg"
          >
            {submitting ? "Submitting..." : `Request ${formatMinutes(selectedMinutes)} Minutes`}
          </button>
        </div>
      ) : (
        <div className="card-glass p-8 text-center">
          <p className="text-gray-400">{loading ? "Loading..." : "No minutes to redeem yet. Start practicing to earn gaming time!"}</p>
          {!loading && (
            <button onClick={() => router.push("/practice")} className="btn-primary mt-4">
              Start Practice
            </button>
          )}
        </div>
      )}
    </div>
  );
}
