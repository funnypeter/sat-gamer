"use client";

interface StreakBadgeProps {
  currentStreak: number;
  longestStreak?: number;
  size?: "sm" | "md" | "lg";
}

export default function StreakBadge({
  currentStreak,
  longestStreak,
  size = "md",
}: StreakBadgeProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-lg",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  const isOnFire = currentStreak >= 7;

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative flex items-center justify-center rounded-full ${
          isOnFire
            ? "bg-gradient-to-br from-yellow-500/20 to-orange-500/20 ring-2 ring-accent-gold/30"
            : "bg-yellow-500/10"
        } ${sizeClasses[size]}`}
      >
        <svg
          className={`${iconSizes[size]} ${
            isOnFire ? "text-accent-gold animate-pulse" : "text-yellow-600"
          }`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
        </svg>

        {isOnFire && (
          <div className="absolute -inset-1 rounded-full bg-accent-gold/10 animate-pulse-glow" />
        )}
      </div>

      <div>
        <p className="font-bold text-white">
          {currentStreak} day{currentStreak !== 1 ? "s" : ""}
        </p>
        {longestStreak !== undefined && (
          <p className="text-xs text-gray-500">
            Best: {longestStreak}
          </p>
        )}
      </div>
    </div>
  );
}
