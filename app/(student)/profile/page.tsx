import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AvatarUpload from "@/components/shared/AvatarUpload";
import SignOutButton from "@/components/shared/SignOutButton";

export default async function StudentProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("display_name, email, avatar_url").eq("id", user.id).single();
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Profile</h2>
        <p className="text-gray-400">Your account</p>
      </div>

      <div className="card-glass p-6">
        <div className="flex items-center gap-5">
          <AvatarUpload currentUrl={profile.avatar_url} displayName={profile.display_name} />
          <div>
            <p className="text-lg font-semibold text-white">{profile.display_name}</p>
            <p className="text-sm text-gray-400">{profile.email}</p>
            <p className="text-xs text-gray-500 mt-1">Tap photo to change</p>
          </div>
        </div>
      </div>

      <SignOutButton />
    </div>
  );
}
