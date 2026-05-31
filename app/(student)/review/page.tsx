import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ReviewCard from "@/components/student/ReviewCard";

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
              <ReviewCard
                key={m.id}
                questionId={q?.id ?? m.question_id}
                category={q?.category ?? "Unknown"}
                answeredAt={m.answered_at}
                passageText={q?.passage_text ?? ""}
                questionText={q?.question_text ?? ""}
                choices={q?.choices ?? []}
                correctAnswer={q?.correct_answer ?? ""}
                answerGiven={m.answer_given}
                explanations={q?.explanations ?? null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
