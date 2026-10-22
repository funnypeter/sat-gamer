import { redirect } from "next/navigation";
import { createClient } from "@/lib/db";
import { createAdminClient } from "@/lib/db";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "parent") {
    redirect("/parent-dashboard");
  } else {
    redirect("/student-dashboard");
  }
}
