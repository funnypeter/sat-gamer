import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import { effectiveStreak } from "@/lib/engine/streak";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "student") {
    redirect("/parent-dashboard");
  }

  const { data: streak } = await admin
    .from("streaks")
    .select("current_streak, last_practice_date")
    .eq("student_id", user.id)
    .single();
  const displayStreak = effectiveStreak(
    streak?.last_practice_date ?? null,
    streak?.current_streak ?? 0
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-navy-900/95 backdrop-blur-sm px-4 py-3">
        <h1 className="font-display text-xl font-bold text-white">
          SAT <span className="text-accent-blue">Gamer</span>
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 badge-gold">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
            </svg>
            <span className="font-semibold">{displayStreak}</span>
          </div>
          <Link href="/profile" className="flex h-8 w-8 rounded-full overflow-hidden bg-accent-blue/20 items-center justify-center">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-accent-blue">{profile.display_name?.[0]?.toUpperCase()}</span>
            )}
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-navy-900/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-md items-center justify-around py-2">
          <NavItem href="/student-dashboard" label="Home" icon="home" />
          <NavItem href="/practice" label="Practice" icon="play" />
          <NavItem href="/review" label="Review" icon="book" />
          <NavItem href="/leaderboard" label="Board" icon="trophy" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>,
    play: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    book: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
    trophy: <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h14a1 1 0 011 1v2a5 5 0 01-5 5h-1v4h3l1 4H6l1-4h3v-4H9a5 5 0 01-5-5V4a1 1 0 011-1z" /></svg>,
  };

  return (
    <Link href={href} className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-400 transition-colors hover:text-accent-blue">
      {icons[icon]}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
