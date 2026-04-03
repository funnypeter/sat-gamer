import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChildOverviewCard from "@/components/parent/ChildOverviewCard";
import RedemptionQueue from "@/components/parent/RedemptionQueue";

export default async function ParentDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("family_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Get family students
  const { data: students } = await supabase
    .from("users")
    .select("*")
    .eq("family_id", profile.family_id)
    .eq("role", "student");

  // Get streaks and balances for each student
  const studentIds = students?.map((s) => s.id) ?? [];

  const { data: streaks } = await supabase
    .from("streaks")
    .select("*")
    .in("student_id", studentIds.length > 0 ? studentIds : ["none"]);

  const { data: balances } = await supabase
    .from("time_balances")
    .select("*")
    .in("student_id", studentIds.length > 0 ? studentIds : ["none"])
    .eq("redeemed", false)
    .gt("expires_at", new Date().toISOString())
    .gt("minutes_remaining", 0);

  // Pending redemption requests
  const { data: pendingRequests } = await supabase
    .from("redemption_requests")
    .select("*, users!redemption_requests_student_id_fkey(display_name)")
    .in("student_id", studentIds.length > 0 ? studentIds : ["none"])
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Build child data
  const childData = (students ?? []).map((student) => {
    const streak = streaks?.find((s) => s.student_id === student.id);
    const studentBalances =
      balances?.filter((b) => b.student_id === student.id) ?? [];
    const totalMinutes = studentBalances.reduce(
      (sum, b) => sum + Number(b.minutes_remaining),
      0
    );

    return {
      id: student.id,
      displayName: student.display_name,
      currentStreak: streak?.current_streak ?? 0,
      longestStreak: streak?.longest_streak ?? 0,
      availableMinutes: totalMinutes,
    };
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">
          Welcome, {profile.display_name}
        </h2>
        <p className="text-gray-400">Your family&apos;s SAT prep overview</p>
      </div>

      {/* Children Overview */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Students</h3>
        {childData.length === 0 ? (
          <div className="card-glass p-8 text-center">
            <p className="text-gray-400">
              No students yet. Add a student to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {childData.map((child) => (
              <ChildOverviewCard key={child.id} child={child} />
            ))}
          </div>
        )}
      </section>

      {/* Redemption Queue */}
      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">
          Pending Requests
        </h3>
        <RedemptionQueue
          requests={
            pendingRequests?.map((r) => ({
              id: r.id,
              studentName:
                (r.users as unknown as { display_name: string })
                  ?.display_name ?? "Unknown",
              requestedMinutes: Number(r.requested_minutes),
              activityDescription: r.activity_description,
              createdAt: r.created_at,
            })) ?? []
          }
        />
      </section>
    </div>
  );
}
