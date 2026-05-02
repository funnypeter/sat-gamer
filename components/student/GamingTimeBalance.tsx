"use client";

import { formatMinutes } from "@/lib/constants";

interface TimeEntry {
  minutes_remaining: number;
  expires_at: string;
}

interface GamingTimeBalanceProps {
  balances: TimeEntry[];
}

export default function GamingTimeBalance({
  balances,
}: GamingTimeBalanceProps) {
  const total = balances.reduce(
    (sum, b) => sum + Number(b.minutes_remaining),
    0
  );

  // Sort by expiration (soonest first)
  const sorted = [...balances].sort(
    (a, b) =>
      new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
  );

  return (
    <div className="card-glow p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Gaming Time
        </h3>
        <span className="text-3xl font-bold text-accent-blue">
          {formatMinutes(total)}
          <span className="text-base text-gray-400 ml-1">min</span>
        </span>
      </div>

      {sorted.length > 0 ? (
        <div className="space-y-2">
          {sorted.slice(0, 5).map((entry, i) => {
            const expiresDate = new Date(entry.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil(
              (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-white">
                  {formatMinutes(Number(entry.minutes_remaining))} min
                </span>
                <span
                  className={`text-xs ${
                    daysLeft <= 2 ? "text-accent-red" : "text-gray-500"
                  }`}
                >
                  {daysLeft <= 0
                    ? "Expires today"
                    : `${daysLeft}d left`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No gaming time yet. Start practicing!
        </p>
      )}
    </div>
  );
}
