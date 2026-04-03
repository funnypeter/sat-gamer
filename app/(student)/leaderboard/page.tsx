import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get the student's family_id
  const { data: profile } = await supabase
    .from("users")
    .select("family_id")
    .eq("id", user.id)
    .single();

  // Fetch family students with their streaks
  const { data: familyStudents } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("family_id", profile?.family_id ?? "")
    .eq("role", "student");

  // Fetch streaks for all family students
  const studentIds = familyStudents?.map((s) => s.id) ?? [];
  const { data: streaks } = await supabase
    .from("streaks")
    .select("student_id, current_streak, longest_streak")
    .in("student_id", studentIds.length > 0 ? studentIds : ["none"]);

  // Merge data
  const leaderboard = (familyStudents ?? [])
    .map((student) => {
      const streak = streaks?.find((s) => s.student_id === student.id);
      return {
        ...student,
        currentStreak: streak?.current_streak ?? 0,
        longestStreak: streak?.longest_streak ?? 0,
      };
    })
    .sort((a, b) => b.currentStreak - a.currentStreak);

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
        <p className="text-gray-400">Family rankings</p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="card-glass p-8 text-center">
          <p className="text-gray-400">No students in your family yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((student, index) => (
            <div
              key={student.id}
              className={`card-glass p-4 flex items-center gap-4 ${
                student.id === user.id ? "ring-1 ring-accent-blue/50" : ""
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
                  index === 0
                    ? "bg-accent-gold/20 text-accent-gold"
                    : index === 1
                    ? "bg-gray-400/20 text-gray-300"
                    : index === 2
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-white/5 text-gray-400"
                }`}
              >
                {index + 1}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">
                  {student.display_name}
                  {student.id === user.id && (
                    <span className="ml-2 text-xs text-accent-blue">(You)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  Best: {student.longestStreak} days
                </p>
              </div>
              <div className="flex items-center gap-1 badge-gold">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
                </svg>
                {student.currentStreak}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
