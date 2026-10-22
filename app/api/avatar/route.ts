import { NextResponse } from "next/server";
import { createClient } from "@/lib/db";
import { createAdminClient } from "@/lib/db";
import { env } from "@/lib/cf";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const path = `${user.id}/avatar.jpg`;
  await env().AVATARS.put(path, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/jpeg" },
  });

  // Add cache-buster to URL (served by app/avatars/[...path]/route.ts)
  const avatarUrl = `/avatars/${path}?t=${Date.now()}`;

  // Update user profile
  await admin.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);

  return NextResponse.json({ avatarUrl });
}
