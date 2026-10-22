"use client";

import { useEffect, useState } from "react";

// A plain form POST — the browser navigates to /api/auth/login, which
// redirects to the dashboard with the session cookie (or back here with an
// error). JS only adds the "Signing in..." state; sign-in works without it.
export default function LoginForm({
  error,
  defaultEmail,
}: {
  error: string | null;
  defaultEmail: string;
}) {
  const [loading, setLoading] = useState(false);

  // Coming back via the browser's back button restores this page from cache
  // with the button still saying "Signing in..."; reset it.
  useEffect(() => {
    const reset = () => setLoading(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      method="post"
      action="/api/auth/login"
      onSubmit={() => setLoading(true)}
      className="card-glass p-8 space-y-6"
    >
      {error && !loading && (
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
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          defaultValue={defaultEmail}
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
          name="password"
          type="password"
          autoComplete="current-password"
          className="input-field"
          placeholder="Enter your password"
          required
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
