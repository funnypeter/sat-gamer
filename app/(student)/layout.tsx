import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "student") {
    redirect("/login");
  }

  // Fetch streak
  const { data: streak } = await supabase
    .from("streaks")
    .select("current_streak")
    .eq("student_id", user.id)
    .single();

  // Fetch unread notification count
  const { count: notifCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-navy-900/95 backdrop-blur-sm px-4 py-3">
        <h1 className="font-display text-xl font-bold text-white">
          SAT <span className="text-accent-blue">Gamer</span>
        </h1>

        <div className="flex items-center gap-4">
          {/* Streak badge */}
          <div className="flex items-center gap-1.5 badge-gold">
            <svg
              className="h-4 w-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2c0 0-4 6-4 10a4 4 0 108 0c0-4-4-10-4-10z" />
            </svg>
            <span className="font-semibold">
              {streak?.current_streak ?? 0}
            </span>
          </div>

          {/* Notifications */}
          <div className="relative">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {(notifCount ?? 0) > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-red text-[10px] font-bold text-white">
                {notifCount}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 px-4 py-6 pb-24">{children}</main>

      {/* Bottom Navigation */}
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

function NavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
    play: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    book: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    trophy: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3h14a1 1 0 011 1v2a5 5 0 01-5 5h-1v4h3l1 4H6l1-4h3v-4H9a5 5 0 01-5-5V4a1 1 0 011-1z" />
      </svg>
    ),
  };

  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-0.5 px-3 py-1 text-gray-400 transition-colors hover:text-accent-blue"
    >
      {icons[icon]}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}
