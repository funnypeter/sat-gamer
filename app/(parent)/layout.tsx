import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "parent") {
    redirect("/login");
  }

  // Pending redemption count
  const { data: familyStudents } = await supabase
    .from("users")
    .select("id")
    .eq("family_id", profile.family_id)
    .eq("role", "student");

  const studentIds = familyStudents?.map((s) => s.id) ?? [];

  const { count: pendingCount } = await supabase
    .from("redemption_requests")
    .select("*", { count: "exact", head: true })
    .in("student_id", studentIds.length > 0 ? studentIds : ["none"])
    .eq("status", "pending");

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-navy-900/95 backdrop-blur-sm px-4 py-3">
        <h1 className="font-display text-xl font-bold text-white">
          SAT <span className="text-accent-blue">Gamer</span>
          <span className="ml-2 text-xs font-normal text-gray-400">
            Parent
          </span>
        </h1>

        <div className="flex items-center gap-3">
          {(pendingCount ?? 0) > 0 && (
            <span className="badge-gold text-xs">
              {pendingCount} pending
            </span>
          )}
          <a href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
            Sign Out
          </a>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-white/5 bg-navy-800/50 px-4">
        <div className="mx-auto flex max-w-4xl gap-6">
          <Link
            href="/parent-dashboard"
            className="border-b-2 border-transparent py-3 text-sm text-gray-400 transition-colors hover:text-white hover:border-accent-blue"
          >
            Dashboard
          </Link>
          <Link
            href="/add-student"
            className="border-b-2 border-transparent py-3 text-sm text-gray-400 transition-colors hover:text-white hover:border-accent-blue"
          >
            Add Student
          </Link>
        </div>
      </nav>

      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
