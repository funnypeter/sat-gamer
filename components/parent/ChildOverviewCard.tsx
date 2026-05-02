"use client";

import Link from "next/link";
import { formatMinutes } from "@/lib/constants";

interface WeakCategory {
  category: string;
  accuracy: number;
  attempted: number;
}

interface ChildData {
  id: string;
  displayName: string;
  currentStreak: number;
  longestStreak: number;
  availableMinutes: number;
  overallAccuracy: number;
  questionsThisWeek: number;
  weakCategories: WeakCategory[];
}

interface ChildOverviewCardProps {
  child: ChildData;
}

export default function ChildOverviewCard({ child }: ChildOverviewCardProps) {
  return (
    <div className="card-glow p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-blue/10 text-accent-blue font-bold">
            {child.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h4 className="font-semibold text-white">
              {child.displayName}
            </h4>
            <p className="text-xs text-gray-400">Student</p>
          </div>
        </div>
        <Link
          href={`/student/${child.id}`}
          className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          View Details &rarr;
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-2">
        {/* Gaming time */}
        <div className="text-center">
          <p className="text-lg font-bold text-accent-blue">
            {formatMinutes(child.availableMinutes)}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Minutes
          </p>
        </div>

        {/* Current streak */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <svg
              className="h-3.5 w-3.5 text-accent-gold"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
            </svg>
            <p className="text-lg font-bold text-accent-gold">
              {child.currentStreak}
            </p>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Streak
          </p>
        </div>

        {/* Best streak */}
        <div className="text-center">
          <p className="text-lg font-bold text-gray-300">
            {child.longestStreak}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Best
          </p>
        </div>

        {/* Overall accuracy */}
        <div className="text-center">
          <p className={`text-lg font-bold ${child.overallAccuracy >= 70 ? "text-accent-green" : child.overallAccuracy >= 50 ? "text-accent-gold" : "text-accent-red"}`}>
            {child.overallAccuracy}%
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Accuracy
          </p>
        </div>

        {/* Questions this week */}
        <div className="text-center">
          <p className="text-lg font-bold text-purple-400">
            {child.questionsThisWeek}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            This Week
          </p>
        </div>
      </div>

      {/* Weakest categories */}
      {child.weakCategories.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Needs Improvement
          </p>
          {child.weakCategories.map((cat) => (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300 truncate mr-2">{cat.category}</span>
                <span className={`font-medium ${cat.accuracy >= 70 ? "text-accent-green" : cat.accuracy >= 50 ? "text-accent-gold" : "text-accent-red"}`}>
                  {cat.accuracy}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${cat.accuracy >= 70 ? "bg-accent-green" : cat.accuracy >= 50 ? "bg-accent-gold" : "bg-accent-red"}`}
                  style={{ width: `${cat.accuracy}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
