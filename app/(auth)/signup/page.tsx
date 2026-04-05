"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Role = "parent" | "student" | null;

export default function SignupPage() {
  const [role, setRole] = useState<Role>(null);
  const [familyName, setFamilyName] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [familyPreview, setFamilyPreview] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Validate family code as student types
  async function checkCode(code: string) {
    setFamilyCode(code);
    setFamilyPreview(null);
    if (code.length < 6) return;
    try {
      const resp = await fetch(`/api/auth/join/lookup?code=${code.toUpperCase()}`);
      const data = await resp.json();
      if (data.familyName) setFamilyPreview(data.familyName);
    } catch {}
  }

  // Fire-and-forget: import CB questions in background after parent signup
  function importCBQuestions() {
    fetch("/api/questions/import-cb", { method: "POST" }).catch(() => {});
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) { setError(authError.message); return; }
      if (!authData.user) { setError("Signup failed. Please try again."); return; }

      if (role === "parent") {
        // Create family + parent profile
        const resp = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: authData.user.id, email, displayName, familyName }),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          setError(errData.error || "Failed to create account.");
          return;
        }
        // Import College Board questions in the background (fire-and-forget)
        importCBQuestions();
        router.push("/parent-dashboard");
        router.refresh();
      } else {
        // Join family as student
        const resp = await fetch("/api/auth/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: authData.user.id, email, displayName, inviteCode: familyCode.toUpperCase() }),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          setError(errData.error || "Failed to join family.");
          return;
        }
        router.push("/student-dashboard");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // Step 1: Choose role
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="font-display text-4xl font-bold text-white">
              SAT <span className="text-accent-blue">Gamer</span>
            </h1>
            <p className="mt-2 text-gray-400">Who are you?</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setRole("parent")}
              className="card-glass w-full p-6 text-left hover:border-accent-blue/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-blue/10 text-accent-blue text-xl">
                  👨‍👩‍👧‍👦
                </div>
                <div>
                  <p className="text-lg font-bold text-white group-hover:text-accent-blue transition-colors">I&apos;m a Parent</p>
                  <p className="text-sm text-gray-400">Create a family and manage your kids&apos; study time</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setRole("student")}
              className="card-glass w-full p-6 text-left hover:border-accent-green/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/10 text-accent-green text-xl">
                  🎮
                </div>
                <div>
                  <p className="text-lg font-bold text-white group-hover:text-accent-green transition-colors">I&apos;m a Student</p>
                  <p className="text-sm text-gray-400">Join your family with a code and start practicing</p>
                </div>
              </div>
            </button>
          </div>

          <p className="text-center text-sm text-gray-400">
            Already have an account?{" "}
            <Link href="/login" className="text-accent-blue hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  // Step 2: Fill in details
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-white">
            SAT <span className="text-accent-blue">Gamer</span>
          </h1>
          <p className="mt-2 text-gray-400">
            {role === "parent" ? "Create your family account" : "Join your family"}
          </p>
        </div>

        <form onSubmit={handleSignup} className="card-glass p-8 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Back button */}
          <button
            type="button"
            onClick={() => { setRole(null); setError(null); }}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {/* Parent: family name */}
          {role === "parent" && (
            <div>
              <label htmlFor="familyName" className="label">Family Name</label>
              <input
                id="familyName"
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="input-field"
                placeholder="Mansour"
                required
              />
            </div>
          )}

          {/* Student: family code */}
          {role === "student" && (
            <div>
              <label htmlFor="familyCode" className="label">Family Code</label>
              <input
                id="familyCode"
                type="text"
                value={familyCode}
                onChange={(e) => checkCode(e.target.value)}
                className="input-field uppercase tracking-widest text-center text-lg"
                placeholder="ABC123"
                maxLength={6}
                required
              />
              {familyPreview && (
                <p className="mt-2 text-sm text-accent-green flex items-center gap-1">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Joining: {familyPreview} Family
                </p>
              )}
              {familyCode.length >= 6 && !familyPreview && (
                <p className="mt-2 text-sm text-red-400">Invalid code. Ask your parent for the family code.</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="displayName" className="label">Your Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field"
              placeholder="Peter"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || (role === "student" && !familyPreview)}
            className="btn-primary w-full"
          >
            {loading ? "Creating account..." : role === "parent" ? "Create Family" : "Join & Start Learning"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-blue hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
