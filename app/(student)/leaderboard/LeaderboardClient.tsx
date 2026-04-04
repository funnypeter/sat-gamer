"use client";

import { useState } from "react";

interface StudentData {
  id: string;
  displayName: string;
  currentStreak: number;
  longestStreak: number;
  avgElo: number;
  allTime: { total: number; correct: number; accuracy: number };
  weekly: { total: number; correct: number; accuracy: number };
}

// Composite score: Accuracy 40%, Streak 25%, Difficulty 20%, Volume 15%
function computeScore(s: StudentData, view: "weekly" | "alltime"): number {
  const stats = view === "weekly" ? s.weekly : s.allTime;
  if (stats.total === 0) return 0;

  const accuracyScore = stats.accuracy; // 0-100
  const streakScore = Math.min(100, s.currentStreak * 10); // 10 days = 100
  const difficultyScore = Math.min(100, ((s.avgElo - 300) / 500) * 100); // 300-800 → 0-100
  const volumeScore = Math.min(100, (stats.total / 50) * 100); // 50 questions = 100

  return Math.round(
    accuracyScore * 0.4 +
    streakScore * 0.25 +
    difficultyScore * 0.2 +
    volumeScore * 0.15
  );
}

export default function LeaderboardClient({
  students,
  currentUserId,
}: {
  students: StudentData[];
  currentUserId: string;
}) {
  const [view, setView] = useState<"weekly" | "alltime">("weekly");

  const ranked = students
    .map((s) => ({ ...s, score: computeScore(s, view) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
        <p className="text-gray-400">Family rankings</p>
      </div>

      {/* Toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5">
        <button
          onClick={() => setView("weekly")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            view === "weekly" ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          This Week
        </button>
        <button
          onClick={() => setView("alltime")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            view === "alltime" ? "bg-accent-blue text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          All Time
        </button>
      </div>

      {/* Score breakdown legend */}
      <div className="flex gap-3 text-[10px] text-gray-500 uppercase tracking-wider">
        <span>Accuracy 40%</span>
        <span>Streak 25%</span>
        <span>Difficulty 20%</span>
        <span>Volume 15%</span>
      </div>

      {/* Rankings */}
      <div className="space-y-3">
        {ranked.map((student, index) => {
          const stats = view === "weekly" ? student.weekly : student.allTime;
          const isYou = student.id === currentUserId;

          return (
            <div
              key={student.id}
              className={`card-glass p-4 ${isYou ? "ring-1 ring-accent-blue/50" : ""}`}
            >
              <div className="flex items-center gap-4">
                {/* Rank */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-lg ${
                  index === 0 ? "bg-accent-gold/20 text-accent-gold" : index === 1 ? "bg-gray-400/20 text-gray-300" : index === 2 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-400"
                }`}>
                  {index + 1}
                </div>

                {/* Name + score */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate">
                      {student.displayName}
                    </p>
                    {isYou && <span className="text-[10px] text-accent-blue font-bold">YOU</span>}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>{stats.accuracy}% acc</span>
                    <span>{stats.total} Qs</span>
                    <span>Elo {student.avgElo}</span>
                  </div>
                </div>

                {/* Composite score */}
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-white">{student.score}</p>
                  <p className="text-[10px] text-gray-500 uppercase">Score</p>
                </div>
              </div>

              {/* Score breakdown bar */}
              <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-white/5">
                <div className="bg-accent-green" style={{ width: `${stats.accuracy * 0.4}%` }} />
                <div className="bg-accent-gold" style={{ width: `${Math.min(100, student.currentStreak * 10) * 0.25}%` }} />
                <div className="bg-accent-blue" style={{ width: `${Math.min(100, ((student.avgElo - 300) / 500) * 100) * 0.2}%` }} />
                <div className="bg-purple-500" style={{ width: `${Math.min(100, (stats.total / 50) * 100) * 0.15}%` }} />
              </div>

              {/* Streak */}
              <div className="mt-2 flex items-center gap-1 text-xs">
                <svg className="h-3 w-3 text-accent-gold" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
                </svg>
                <span className="text-accent-gold font-semibold">{student.currentStreak} day streak</span>
                <span className="text-gray-500 ml-1">· best {student.longestStreak}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
