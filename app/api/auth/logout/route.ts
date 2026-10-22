import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST() {
  await signOut();
  return NextResponse.json({ success: true });
}

/** Plain-link sign out (parent header): clear the session, land on /login. */
export async function GET(request: Request) {
  await signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
