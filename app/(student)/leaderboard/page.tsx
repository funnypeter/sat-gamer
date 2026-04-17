import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LeaderboardClient from "./LeaderboardClient";
import { buildLeaderboard } from "@/lib/engine/leaderboard";

export default async function LeaderboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("users")
    .select("family_id")
    .eq("id", user.id)
    .single();
  const { data: familyStudents } = await admin
    .from("users")
    .select("id, display_name")
    .eq("family_id", profile?.family_id ?? "")
    .eq("role", "student");

  if (!familyStudents || familyStudents.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
        <div className="card-glass p-8 text-center">
          <p className="text-gray-400">No students in your family yet.</p>
        </div>
      </div>
    );
  }

  const students = await buildLeaderboard(admin, familyStudents);
  return <LeaderboardClient students={students} currentUserId={user.id} />;
}
