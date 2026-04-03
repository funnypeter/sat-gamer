"use client";

interface PracticeTimerProps {
  blockSeconds: number;
  blockMinutes: number;
}

export default function PracticeTimer({
  blockSeconds,
  blockMinutes,
}: PracticeTimerProps) {
  const totalSeconds = blockMinutes * 60;
  const progress = Math.min(blockSeconds / totalSeconds, 1);
  const circumference = 2 * Math.PI * 22; // radius = 22
  const strokeDashoffset = circumference * (1 - progress);

  const minutes = Math.floor(blockSeconds / 60);
  const seconds = blockSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const total = `${blockMinutes}:00`;

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative h-12 w-12">
        <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48">
          {/* Background circle */}
          <circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="3"
          />
          {/* Progress circle */}
          <circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke={progress >= 1 ? "#22c55e" : "#3b82f6"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">{display}</span>
        </div>
      </div>
      <span className="text-xs text-gray-500">/ {total}</span>
    </div>
  );
}
