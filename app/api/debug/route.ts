import { NextResponse } from "next/server";
import { env } from "@/lib/cf";

// Deployment health check: are the bindings and secrets wired up?
export async function GET() {
  const e = env();
  let dbOk = false;
  try {
    dbOk = !!(await e.DB.prepare("SELECT 1 AS ok").first());
  } catch {}
  return NextResponse.json({
    hasDb: dbOk,
    hasAvatars: !!e.AVATARS,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
  });
}
