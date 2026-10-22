import { NextRequest, NextResponse } from "next/server";
import { AuthError, signInWithPassword } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";

// Sign-in is a plain HTML form POST (see app/(auth)/login and
// lib/sign-in-form.ts), answered with a 303 redirect that carries the session
// cookie. Don't switch it back to fetch() + client-side navigation: WebKit on
// iPhone (Safari and Chrome for iOS) doesn't reliably keep a cookie set on a
// fetch response, so the student "signs in", gets bounced to /login by the
// middleware, and sees nothing happen. A cookie on a top-level navigation
// response is kept by every browser, and the form works even if JS doesn't.
//
// JSON posts still get a JSON reply, for scripts and tests.

async function readCredentials(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return { email: String(body.email ?? ""), password: String(body.password ?? ""), isForm: false };
  }
  const form = await req.formData().catch(() => null);
  return {
    email: String(form?.get("email") ?? ""),
    password: String(form?.get("password") ?? ""),
    isForm: true,
  };
}

export async function POST(req: NextRequest) {
  const { email, password, isForm } = await readCredentials(req);
  try {
    const user = await signInWithPassword(email, password);
    const { data: profile } = await createAdminClient()
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = profile?.role ?? "student";
    if (!isForm) return NextResponse.json({ role });
    const dest = role === "parent" ? "/parent-dashboard" : "/student-dashboard";
    return NextResponse.redirect(new URL(dest, req.url), 303);
  } catch (err) {
    const message = err instanceof AuthError ? err.message : "Login failed. Please try again.";
    if (!(err instanceof AuthError)) console.error("Login error:", err);
    if (!isForm) return NextResponse.json({ error: message }, { status: 400 });
    const back = new URL("/login", req.url);
    back.searchParams.set("error", message);
    if (email) back.searchParams.set("email", email);
    return NextResponse.redirect(back, 303);
  }
}
