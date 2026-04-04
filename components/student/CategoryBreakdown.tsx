"use client";

import { useState } from "react";

interface CategoryStat {
  category: string;
  elo_rating: number;
  total_attempted: number;
  total_correct: number;
}

export default function CategoryBreakdown({ stats }: { stats: CategoryStat[] }) {
  const [open, setOpen] = useState(false);

  // Top 3 weakest for the collapsed preview
  const top3 = stats.slice(0, 3);
  const overallAcc = stats.reduce((sum, c) => sum + c.total_correct, 0) / Math.max(1, stats.reduce((sum, c) => sum + c.total_attempted, 0)) * 100;

  return (
    <div className="card-glass overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/10">
            <svg className="h-4 w-4 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Category Performance</p>
            <p className="text-xs text-gray-400">{Math.round(overallAcc)}% overall · {stats.length} categories</p>
          </div>
        </div>
        <svg className={`h-5 w-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsed preview — top 3 weakest as mini bars */}
      {!open && (
        <div className="px-4 pb-3 space-y-1.5">
          {top3.map((cat) => {
            const acc = cat.total_attempted > 0 ? Math.round((cat.total_correct / cat.total_attempted) * 100) : 0;
            const barColor = acc >= 80 ? "bg-accent-green" : acc >= 60 ? "bg-accent-blue" : "bg-accent-red";
            return (
              <div key={cat.category} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-28 truncate">{cat.category.replace("Command of Evidence ", "CoE ")}</span>
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${acc}%` }} />
                </div>
                <span className="text-[11px] text-gray-500 w-6 text-right">{acc}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded — all categories */}
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {stats.map((cat) => {
            const acc = cat.total_attempted > 0 ? Math.round((cat.total_correct / cat.total_attempted) * 100) : 0;
            const eloColor = cat.elo_rating >= 600 ? "text-accent-green" : cat.elo_rating >= 450 ? "text-accent-blue" : "text-accent-red";
            const barColor = acc >= 80 ? "bg-accent-green" : acc >= 60 ? "bg-accent-blue" : "bg-accent-red";
            return (
              <div key={cat.category} className="flex items-center gap-3 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{cat.category}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${acc}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 w-8 text-right">{acc}%</span>
                  </div>
                </div>
                <div className="text-right shrink-0 w-12">
                  <p className={`text-xs font-bold ${eloColor}`}>{cat.elo_rating}</p>
                  <p className="text-[9px] text-gray-500">{cat.total_attempted} Qs</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
