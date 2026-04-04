import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import InviteCodeCard from "@/components/parent/InviteCodeCard";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: profile } = await admin.from("users").select("family_id, display_name, email").eq("id", user.id).single();
  if (!profile) redirect("/login");

  const { data: familyRows } = await admin.rpc("get_family_by_id", { family_id_input: profile.family_id });
  const family = Array.isArray(familyRows) ? familyRows[0] : familyRows;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-gray-400">Account &amp; family settings</p>
      </div>

      <section className="card-glass p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Profile</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Name</span>
            <span className="text-white">{profile.display_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Email</span>
            <span className="text-white">{profile.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Role</span>
            <span className="text-white">Parent</span>
          </div>
        </div>
      </section>

      {family?.invite_code && (
        <section>
          <h3 className="mb-4 text-lg font-semibold text-white">Family Invite Code</h3>
          <InviteCodeCard inviteCode={family.invite_code} />
        </section>
      )}
    </div>
  );
}
