import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ReviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Fetch recent incorrect answers with question details
  const { data: mistakes } = await admin
    .from("student_questions")
    .select("*, questions(*)")
    .eq("student_id", user.id)
    .eq("is_correct", false)
    .order("answered_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-md space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Review</h2>
        <p className="text-gray-400">Learn from your mistakes</p>
      </div>

      {(!mistakes || mistakes.length === 0) ? (
        <div className="card-glass p-8 text-center">
          <p className="text-gray-400">No mistakes to review yet. Keep practicing!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {mistakes.map((m: any) => {
            const q = m.questions;
            return (
              <div key={m.id} className="card-glass p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent-blue">
                    {q?.category ?? "Unknown"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(m.answered_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-gray-400 line-clamp-3">
                  {q?.passage_text ?? ""}
                </p>
                <p className="text-sm font-medium text-white">
                  {q?.question_text ?? ""}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                    <span className="text-gray-400">Your answer: </span>
                    <span className="text-accent-red font-semibold">{m.answer_given}</span>
                  </div>
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
                    <span className="text-gray-400">Correct: </span>
                    <span className="text-accent-green font-semibold">{q?.correct_answer ?? ""}</span>
                  </div>
                </div>
                {q?.explanations && (
                  <div className="text-xs text-gray-400 bg-white/5 rounded-lg p-3">
                    <p className="font-semibold text-accent-green mb-1">Why {q.correct_answer} is correct:</p>
                    <p>{q.explanations[q.correct_answer]}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
