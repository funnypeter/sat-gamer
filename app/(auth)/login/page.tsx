import Link from "next/link";
import LoginForm from "./LoginForm";

// Sign-in posts a real HTML form to /api/auth/login (see the note there for
// why it isn't fetch). A failed attempt redirects back here with ?error= and
// the email, so the form can show the message and keep what they typed.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const { error, email } = await searchParams;

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

        <LoginForm error={error ?? null} defaultEmail={email ?? ""} />

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
