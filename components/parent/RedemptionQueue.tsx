"use client";

import { useState } from "react";

interface RedemptionRequest {
  id: string;
  studentName: string;
  requestedMinutes: number;
  activityDescription: string;
  createdAt: string;
}

interface RedemptionQueueProps {
  requests: RedemptionRequest[];
}

export default function RedemptionQueue({ requests }: RedemptionQueueProps) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  async function handleResolve(
    requestId: string,
    action: "approved" | "denied"
  ) {
    setResolving(requestId);

    try {
      const res = await fetch("/api/redeem/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      if (res.ok) {
        setResolvedIds((prev) => new Set(prev).add(requestId));
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setResolving(null);
    }
  }

  const pendingRequests = requests.filter(
    (r) => !resolvedIds.has(r.id)
  );

  if (pendingRequests.length === 0) {
    return (
      <div className="card-glass p-8 text-center">
        <p className="text-gray-400">No pending redemption requests.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingRequests.map((request) => {
        const isResolving = resolving === request.id;
        const timeAgo = getTimeAgo(request.createdAt);

        return (
          <div key={request.id} className="card-glass p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">
                    {request.studentName}
                  </span>
                  <span className="badge-blue">
                    {request.requestedMinutes} min
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  {request.activityDescription || "Gaming time"}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">{timeAgo}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleResolve(request.id, "approved")}
                  disabled={isResolving}
                  className="rounded-lg bg-accent-green/10 border border-accent-green/20 px-3 py-2 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/20 disabled:opacity-50"
                >
                  {isResolving ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => handleResolve(request.id, "denied")}
                  disabled={isResolving}
                  className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-3 py-2 text-sm font-medium text-accent-red transition-colors hover:bg-accent-red/20 disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
