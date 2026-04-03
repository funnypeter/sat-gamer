"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword(
        { email, password }
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.user) {
        setError("Login failed. Please try again.");
        return;
      }

      // Fetch user role to determine redirect
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .single();

      // Set a cookie so middleware can read the role
      document.cookie = `user_role=${profile?.role ?? "student"}; path=/; max-age=${60 * 60 * 24 * 30}`;

      if (profile?.role === "parent") {
        router.push("/parent-dashboard");
      } else {
        router.push("/student-dashboard");
      }

      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-white">
            SAT <span className="text-accent-blue">Gamer</span>
          </h1>
          <p className="mt-2 text-gray-400">
            Sign in to continue your prep
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="card-glass p-8 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

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
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-accent-blue hover:underline font-medium"
          >
            Sign up as a parent
          </Link>
        </p>
      </div>
    </div>
  );
}
