import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { selectNextQuestion } from "@/lib/engine/question-selector";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const question = await selectNextQuestion(supabase, user.id);

    if (!question) {
      return NextResponse.json({ question: null });
    }

    // Don't send correct_answer or explanations to the client before answering
    const safeQuestion = {
      id: question.id,
      category: question.category,
      passage_text: question.passage_text,
      question_text: question.question_text,
      choices: question.choices,
      difficulty_rating: question.difficulty_rating,
    };

    return NextResponse.json({ question: safeQuestion });
  } catch (err) {
    console.error("Question fetch error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
