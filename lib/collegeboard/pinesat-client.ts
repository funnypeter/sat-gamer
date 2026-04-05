export interface PineSATQuestion {
  id: string;
  domain: string;
  question: {
    paragraph: string;
    question: string;
    choices: Record<string, string>;
    correct_answer: string;
    explanation: string;
  };
  difficulty: "Easy" | "Medium" | "Hard";
}

const PINESAT_BASE = "https://pinesat.com/api/questions";

export async function fetchPineSATQuestions(
  domain?: string,
  limit?: number
): Promise<PineSATQuestion[]> {
  const params = new URLSearchParams({ section: "english" });
  if (domain) params.set("domain", domain);
  if (limit) params.set("limit", String(limit));

  const res = await fetch(`${PINESAT_BASE}?${params}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`PineSAT API error: ${res.status} ${res.statusText}`);
  }

  const data: PineSATQuestion[] = await res.json();

  // Filter out questions with missing required fields
  return data.filter(
    (q) =>
      q.question?.paragraph &&
      q.question?.question &&
      q.question?.choices &&
      q.question?.correct_answer &&
      Object.keys(q.question.choices).length === 4
  );
}
