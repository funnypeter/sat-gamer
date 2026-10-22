import { AuthError, createAuthUser, deleteAuthUser, startSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/db";
import { DSAT_CATEGORIES } from "@/lib/constants";

// Shared by the signup / join / join-parent / students-create routes: create
// the login and the users-row profile together, rolling the login back if
// the profile can't be written, so there's never a login with no profile.

export interface NewAccount {
  email: string;
  password: string;
  displayName: string;
  familyId: string;
  role: "parent" | "student";
}

export async function createAccount(a: NewAccount, opts: { signIn: boolean }) {
  const admin = createAdminClient();
  const user = await createAuthUser(a.email, a.password);

  const { error } = await admin.from("users").insert({
    id: user.id,
    family_id: a.familyId,
    role: a.role,
    display_name: a.displayName,
    email: user.email,
  });
  if (error) {
    await deleteAuthUser(user.id);
    throw new Error(`Failed to create user profile: ${error.message}`);
  }

  if (a.role === "student") {
    // Initial stats for all 10 DSAT categories, and the streak row.
    await admin.from("student_stats").insert(
      DSAT_CATEGORIES.map((category) => ({
        student_id: user.id,
        category,
        elo_rating: 500,
        total_attempted: 0,
        total_correct: 0,
      }))
    );
    await admin.from("streaks").insert({ student_id: user.id, current_streak: 0, longest_streak: 0 });
  }

  if (opts.signIn) await startSession(user.id);
  return user;
}

export function signupErrorResponse(err: unknown) {
  if (err instanceof AuthError) return { error: err.message, status: 400 };
  console.error("Signup error:", err);
  return { error: "Failed to create account.", status: 500 };
}
