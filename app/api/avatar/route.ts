import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const path = `${user.id}/avatar.jpg`;

  // Delete old avatar first, then upload new one
  await admin.storage.from("avatars").remove([path]);
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from("avatars").getPublicUrl(path);

  // Add cache-buster to URL
  const avatarUrl = `${publicUrl}?t=${Date.now()}`;

  // Update user profile
  await admin.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);

  return NextResponse.json({ avatarUrl });
}
