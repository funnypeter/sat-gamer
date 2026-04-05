"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function ParentJoinPage() {
  const params = useParams();
  const code = params.code as string;
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(true);
  const [invalidCode, setInvalidCode] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function lookupFamily() {
      try {
        const res = await fetch(`/api/auth/join/lookup?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (res.ok && data.familyName) {
          setFamilyName(data.familyName);
        } else {
          setInvalidCode(true);
        }
      } catch {
        setInvalidCode(true);
      } finally {
        setLoadingFamily(false);
      }
    }
    lookupFamily();
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            role: "parent",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user) {
        setError("Signup failed. Please try again.");
        return;
      }

      const setupResp = await fetch("/api/auth/join-parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user.id,
          email,
          displayName,
          inviteCode: code,
        }),
      });

      if (!setupResp.ok) {
        const errData = await setupResp.json().catch(() => ({}));
        setError(errData.error || "Failed to join family. Please try again.");
        return;
      }

      document.cookie = `user_role=parent; path=/; max-age=${60 * 60 * 24 * 30}`;

      router.push("/parent-dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingFamily) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (invalidCode) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <h1 className="font-display text-4xl font-bold text-white">
            SAT <span className="text-accent-blue">Gamer</span>
          </h1>
          <div className="card-glass p-8 space-y-4">
            <div className="text-5xl">😕</div>
            <h2 className="text-xl font-bold text-white">Invalid Invite Link</h2>
            <p className="text-gray-400">
              This invite link doesn&apos;t seem to be valid. Ask your partner for the correct link.
            </p>
            <Link href="/login" className="btn-primary inline-block mt-4">
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-white">
            SAT <span className="text-accent-blue">Gamer</span>
          </h1>
          <p className="mt-3 text-lg text-gray-300">
            Join the{" "}
            <span className="font-semibold text-accent-blue">{familyName}</span>{" "}
            Family
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Create your parent account to help manage your family
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card-glass p-8 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="displayName" className="label">
              Your Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field"
              placeholder="Jane"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
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
            disabled={loading}
            className="btn-primary w-full text-lg py-3"
          >
            {loading ? "Joining..." : "Join as Parent"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-accent-blue hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
