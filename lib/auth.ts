import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { d1 } from "@/lib/cf";

// Email + password auth with cookie sessions on D1 (replaces Supabase Auth).
//
// Passwords migrated from Supabase keep their bcrypt hashes, so existing
// accounts sign in unchanged; on the first successful login the hash is
// replaced with PBKDF2 (native WebCrypto — bcrypt in JS costs ~100ms of CPU
// per check). The session cookie holds a random token; D1 stores only its
// SHA-256.

export const SESSION_COOKIE = "sg_session";
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000; // Workers' maximum

export interface AuthUser {
  id: string;
  email: string;
}

export class AuthError extends Error {}

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...Array.from(new Uint8Array(buf))));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith("pbkdf2$")) {
    const [, iter, salt, hash] = stored.split("$");
    const actual = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
    const expected = unb64(hash);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  }
  if (stored.startsWith("$2")) return bcrypt.compare(password, stored);
  return false;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function validate(email: string, password: string) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address");
  if (password.length < 6) throw new AuthError("Password should be at least 6 characters.");
}

/** The signed-in user for this request, or null. */
export async function getSessionUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return d1()
    .prepare(
      `SELECT u.id, u.email FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .bind(await sha256(token), Date.now())
    .first<AuthUser>();
}

/** Create a login (no session). Throws AuthError if the email is taken. */
export async function createAuthUser(rawEmail: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  validate(email, password);
  const existing = await d1().prepare("SELECT 1 FROM auth_users WHERE email = ?").bind(email).first();
  if (existing) throw new AuthError("User already registered");
  const user = { id: crypto.randomUUID(), email };
  await d1()
    .prepare("INSERT INTO auth_users (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(user.id, email, await hashPassword(password))
    .run();
  return user;
}

/** Remove a login created by createAuthUser (rollback when profile setup fails). */
export async function deleteAuthUser(id: string) {
  await d1().prepare("DELETE FROM auth_users WHERE id = ?").bind(id).run();
}

export async function startSession(userId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expires = Date.now() + SESSION_MS;
  await d1().batch([
    d1().prepare("DELETE FROM auth_sessions WHERE expires_at < ?").bind(Date.now()),
    d1()
      .prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), userId, expires),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expires),
  });
}

export async function signInWithPassword(rawEmail: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(rawEmail);
  const row = await d1()
    .prepare("SELECT id, email, password_hash FROM auth_users WHERE email = ?")
    .bind(email)
    .first<AuthUser & { password_hash: string }>();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError("Invalid login credentials");
  }
  if (!row.password_hash.startsWith("pbkdf2$")) {
    await d1()
      .prepare("UPDATE auth_users SET password_hash = ? WHERE id = ?")
      .bind(await hashPassword(password), row.id)
      .run();
  }
  await startSession(row.id);
  return { id: row.id, email: row.email };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await d1().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  jar.delete(SESSION_COOKIE);
}
