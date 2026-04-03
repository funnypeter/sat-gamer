import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch recent incorrect answers
  const { data: mistakes } = await supabase
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
          {mistakes.map((m) => {
            const q = m.questions as Record<string, unknown> | null;
            return (
              <div key={m.id} className="card-glass p-4 space-y-2">
                <div className="badge-red mb-2">
                  {(q as Record<string, unknown>)?.category as string ?? "Unknown"}
                </div>
                <p className="text-sm text-gray-300 line-clamp-2">
                  {(q as Record<string, unknown>)?.passage_text as string ?? ""}
                </p>
                <p className="text-sm font-medium text-white">
                  {(q as Record<string, unknown>)?.question_text as string ?? ""}
                </p>
                <div className="flex gap-2 text-xs">
                  <span className="text-accent-red">
                    Your answer: {m.answer_given}
                  </span>
                  <span className="text-accent-green">
                    Correct: {(q as Record<string, unknown>)?.correct_answer as string ?? ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
