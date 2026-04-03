"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddStudentPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const res = await fetch("/api/students/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create student");
        return;
      }

      setSuccess(true);
      setDisplayName("");
      setEmail("");
      setPassword("");

      // Refresh to update sidebar counts
      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Add a Student</h2>
        <p className="text-gray-400">
          Create an account for your child to start practicing
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card-glass p-6 space-y-5">
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
            Student account created successfully! They can now log in.
          </div>
        )}

        <div>
          <label htmlFor="displayName" className="label">
            Student Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input-field"
            placeholder="Alex Smith"
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
            placeholder="student@example.com"
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
          className="btn-primary w-full"
        >
          {loading ? "Creating..." : "Create Student Account"}
        </button>
      </form>
    </div>
  );
}
