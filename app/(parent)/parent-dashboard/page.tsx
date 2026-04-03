import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import ChildOverviewCard from "@/components/parent/ChildOverviewCard";
import RedemptionQueue from "@/components/parent/RedemptionQueue";
import InviteCodeCard from "@/components/parent/InviteCodeCard";

export default async function ParentDashboard() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: profile } = await admin
    .from("users")
    .select("family_id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Use raw query to get invite_code (bypasses PostgREST schema cache)
  const { data: familyRows } = await admin.rpc("get_family_by_id", { family_id_input: profile.family_id });
  const family = Array.isArray(familyRows) ? familyRows[0] : familyRows;

  const { data: students } = await admin
    .from("users")
    .select("*")
    .eq("family_id", profile.family_id)
    .eq("role", "student");

  const studentIds = (students ?? []).map((s: { id: string }) => s.id);

  const { data: streaks } = studentIds.length > 0
    ? await admin.from("streaks").select("*").in("student_id", studentIds)
    : { data: [] };

  const { data: balances } = studentIds.length > 0
    ? await admin.from("time_balances").select("*").in("student_id", studentIds).eq("redeemed", false).gt("expires_at", new Date().toISOString())
    : { data: [] };

  const { data: pendingRequests } = studentIds.length > 0
    ? await admin.from("redemption_requests").select("*").in("student_id", studentIds).eq("status", "pending").order("created_at", { ascending: false })
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childData = (students ?? []).map((student: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streak = (streaks ?? []).find((s: any) => s.student_id === student.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studentBals = (balances ?? []).filter((b: any) => b.student_id === student.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalMin = studentBals.reduce((sum: number, b: any) => sum + Number(b.minutes_remaining || 0), 0);
    return {
      id: student.id,
      displayName: student.display_name,
      currentStreak: streak?.current_streak ?? 0,
      longestStreak: streak?.longest_streak ?? 0,
      availableMinutes: totalMin,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestsWithNames = (pendingRequests ?? []).map((r: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const student = (students ?? []).find((s: any) => s.id === r.student_id);
    return {
      id: r.id,
      studentName: student?.display_name ?? "Unknown",
      requestedMinutes: Number(r.requested_minutes),
      activityDescription: r.activity_description || "",
      createdAt: r.created_at,
    };
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Welcome, {profile.display_name}</h2>
        <p className="text-gray-400">Your family&apos;s SAT prep overview</p>
      </div>

      {family?.invite_code && (
        <InviteCodeCard inviteCode={family.invite_code} />
      )}

      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Students</h3>
        {childData.length === 0 ? (
          <div className="card-glass p-8 text-center">
            <p className="text-gray-400">No students yet. Add a student to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {childData.map((child) => (
              <ChildOverviewCard key={child.id} child={child} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-4 text-lg font-semibold text-white">Pending Requests</h3>
        <RedemptionQueue requests={requestsWithNames} />
      </section>
    </div>
  );
}
