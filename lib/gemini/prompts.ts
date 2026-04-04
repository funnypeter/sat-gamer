import type { DifficultyBand, DsatCategory } from "@/lib/constants";
import { DIFFICULTY_BANDS } from "@/lib/constants";

const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  "Words in Context": `Generate questions where students must select the word or phrase that best completes a sentence based on meaning and context. The passage should contain a blank (indicated by ___) where one word or short phrase has been removed. Each answer choice should be a single word or short phrase that could plausibly fill the blank. Only one should be contextually correct. Passages should come from varied domains: literature, science, social science, history.`,

  "Text Structure & Purpose": `Generate questions asking students to identify the main purpose, function, or organizational structure of a passage or a specific part of a passage. Questions might ask "Which choice best describes the function of the underlined sentence?" or "What is the main purpose of the passage?" Passages should be 50-100 words with clear rhetorical structure.`,

  "Cross-Text Connections": `Generate questions that present TWO short passages (Text 1 and Text 2, each 25-75 words) on related topics. Students must identify how the texts relate — whether they agree, disagree, one elaborates on the other, etc. Format the passage_text as "Text 1: [passage]\\n\\nText 2: [passage]". Questions should ask about the relationship between the two texts.`,

  "Command of Evidence (Textual)": `Generate questions where students must select the textual evidence (a quote or detail from the passage) that best supports a given claim or conclusion. The question stem should present a claim, and the answer choices should each be quotations or references from the passage. Only one choice genuinely supports the claim.`,

  "Command of Evidence (Quantitative)": `Generate questions that include a brief passage with embedded data (describe a table, chart, or graph in the passage text — e.g., "According to a 2023 study, Group A showed 45% improvement while Group B showed 12% improvement..."). Students must identify which conclusion is best supported by the data. Include specific numbers and statistics in the passage.`,

  "Central Ideas & Details": `Generate questions asking students to identify the main idea, central claim, or key details of a passage. Questions might ask "Which choice best states the main idea?" or "According to the passage, what is the primary reason...?" Passages should have a clear central argument or narrative with supporting details.`,

  "Inferences": `Generate questions requiring students to draw logical conclusions that are not explicitly stated but are strongly supported by the passage. Questions should ask "Which choice is most strongly supported by the passage?" or "Based on the passage, it can most reasonably be inferred that...". The correct answer must be logically necessitated by the text, while distractors should be plausible but unsupported.`,

  "Rhetoric": `Generate questions analyzing how an author uses language, tone, or rhetorical strategies to achieve a specific effect. Questions might ask about the author's tone, the effect of a particular word choice, or the rhetorical purpose of a specific technique. Passages should have distinctive stylistic features.`,

  "Standard English Conventions": `Generate questions testing grammar, punctuation, and sentence structure. The passage should contain a sentence with a blank or underlined portion, and students choose the option that is grammatically correct and maintains proper conventions. Test specific rules: subject-verb agreement, pronoun-antecedent agreement, comma usage, semicolons, colons, apostrophes, sentence boundaries, parallel structure, modifier placement.`,

  "Transitions": `Generate questions where students select the transition word or phrase that most logically connects ideas within or between sentences. The passage should contain a blank where a transition belongs. Answer choices should all be real transitions but only one fits the logical relationship (contrast, cause-effect, continuation, example, etc.).`,
};

export function buildQuestionGenerationPrompt(
  category: DsatCategory,
  difficultyBand: DifficultyBand
): string {
  const band = DIFFICULTY_BANDS[difficultyBand];
  const categoryInstruction = CATEGORY_INSTRUCTIONS[category] ?? "";

  return `You are an expert Digital SAT (DSAT) question author, trained on the format used by College Board and The Princeton Review. Generate exactly 3 high-quality practice questions.

FORMAT: Digital SAT Reading & Writing section
- Each question is based on a SHORT passage (25–150 words) — this is the DSAT format, NOT the old SAT format
- One question per passage (single-question-per-passage structure)
- 4 answer choices labeled A, B, C, D
- Questions should feel indistinguishable from real DSAT questions

CATEGORY: ${category}
DIFFICULTY: ${difficultyBand} (target rating ${band.min}–${band.max})

CATEGORY-SPECIFIC INSTRUCTIONS:
${categoryInstruction}

DIFFICULTY GUIDELINES:
- Easy (300-450): Straightforward passages, common vocabulary, clear answer distinctions
- Medium (450-600): More nuanced passages, requires careful reading, closer distractors
- Hard (600-800): Complex passages, subtle distinctions, sophisticated vocabulary, distractors that require deep comprehension to eliminate

PASSAGE VARIETY — use diverse source material:
- Literary fiction and narrative nonfiction
- Natural science (biology, chemistry, physics, earth science)
- Social science (psychology, sociology, economics, political science)
- History and humanities (art, philosophy, cultural studies)

QUALITY REQUIREMENTS:
- Passages must feel authentic and well-written, not artificially constructed
- Distractors must be plausible — avoid obviously wrong answers
- Explanations must clearly articulate WHY the correct answer is right AND why each distractor fails
- Vary the position of the correct answer across questions (don't cluster on one letter)
- Each question should test a genuinely different passage and concept

OUTPUT: Return ONLY a valid JSON array. No markdown, no code fences, no extra text.

Each object in the array must have exactly these fields:
{
  "passage_text": "The passage text (25-150 words)",
  "question_text": "The question",
  "choices": [
    {"label": "A", "text": "First choice"},
    {"label": "B", "text": "Second choice"},
    {"label": "C", "text": "Third choice"},
    {"label": "D", "text": "Fourth choice"}
  ],
  "correct_answer": "B",
  "explanations": {
    "A": "Why A is incorrect...",
    "B": "Why B is correct...",
    "C": "Why C is incorrect...",
    "D": "Why D is incorrect..."
  },
  "difficulty_rating": 520
}

Generate 3 questions now:`;
}
