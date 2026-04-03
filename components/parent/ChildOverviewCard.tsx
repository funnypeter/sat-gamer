"use client";

interface ChildData {
  id: string;
  displayName: string;
  currentStreak: number;
  longestStreak: number;
  availableMinutes: number;
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
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Gaming time */}
        <div className="text-center">
          <p className="text-xl font-bold text-accent-blue">
            {child.availableMinutes}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Minutes
          </p>
        </div>

        {/* Current streak */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <svg
              className="h-4 w-4 text-accent-gold"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
            </svg>
            <p className="text-xl font-bold text-accent-gold">
              {child.currentStreak}
            </p>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Streak
          </p>
        </div>

        {/* Best streak */}
        <div className="text-center">
          <p className="text-xl font-bold text-gray-300">
            {child.longestStreak}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Best
          </p>
        </div>
      </div>
    </div>
  );
}
