import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import InviteCodeCard from "@/components/parent/InviteCodeCard";
import ParentInviteCard from "@/components/parent/ParentInviteCard";
import AvatarUpload from "@/components/shared/AvatarUpload";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: profile } = await admin.from("users").select("family_id, display_name, email, avatar_url").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: familyRows } = await admin.rpc("get_family_by_id", { family_id_input: profile.family_id });
  const family = Array.isArray(familyRows) ? familyRows[0] : familyRows;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-gray-400">Account &amp; family settings</p>
      </div>

      <section className="card-glass p-6">
        <div className="flex items-center gap-5">
          <AvatarUpload currentUrl={profile.avatar_url} displayName={profile.display_name} />
          <div>
            <p className="text-lg font-semibold text-white">{profile.display_name}</p>
            <p className="text-sm text-gray-400">{profile.email}</p>
            <p className="text-xs text-gray-500 mt-1">Tap photo to change</p>
          </div>
        </div>
      </section>

      {family?.invite_code && (
        <section className="space-y-6">
          <div>
            <h3 className="mb-4 text-lg font-semibold text-white">Invite Students</h3>
            <InviteCodeCard inviteCode={family.invite_code} />
          </div>
          <div>
            <h3 className="mb-4 text-lg font-semibold text-white">Invite Co-Parent</h3>
            <ParentInviteCard inviteCode={family.invite_code} />
          </div>
        </section>
      )}
    </div>
  );
}
