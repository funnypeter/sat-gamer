import type { DsatCategory } from "@/lib/constants";
import type {
  QbankIndexEntry,
  QbankQuestionDetail,
} from "./qbank-client";

const DIFFICULTY_MAP: Record<"E" | "M" | "H", number> = {
  E: 375,
  M: 525,
  H: 700,
};

/**
 * Map College Board's skill code (the granular sub-skill within a domain)
 * to the 10-category DSAT enum the rest of the app uses.
 *
 * Command of Evidence (COE) is split between Textual and Quantitative in
 * our enum but is one skill in CB's API. We default to Textual and let
 * the caller upgrade to Quantitative when the stimulus contains data
 * markup (a <table> or chart references).
 */
const SKILL_TO_CATEGORY: Record<string, DsatCategory> = {
  CID: "Central Ideas & Details",
  COE: "Command of Evidence (Textual)",
  INF: "Inferences",
  CTC: "Cross-Text Connections",
  TSP: "Text Structure & Purpose",
  WIC: "Words in Context",
  SYN: "Rhetoric",
  TRA: "Transitions",
  BOU: "Standard English Conventions",
  FSS: "Standard English Conventions",
};

function looksQuantitative(stimulusHtml: string): boolean {
  // CB embeds data tables as <table> markup. Charts come through with
  // alt text containing words like "graph" or "figure" — but those are
  // image questions which we filter out separately.
  return /<table/i.test(stimulusHtml);
}

export function mapSkillToCategory(
  skill_cd: string,
  stimulusHtml: string
): DsatCategory | null {
  const base = SKILL_TO_CATEGORY[skill_cd];
  if (!base) return null;
  if (skill_cd === "COE" && looksQuantitative(stimulusHtml)) {
    return "Command of Evidence (Quantitative)";
  }
  return base;
}

/**
 * The CB stimulus uses an accessibility pattern for fill-in-the-blank
 * markers: a visible underscore span plus a screen-reader-only "blank"
 * span. Our renderer doesn't ship the sr-only CSS class, so the literal
 * word "blank" leaks into the visible passage. Replace the whole thing
 * with a plain ______ that renders correctly.
 *
 * Also collapse any other tags we don't allow (e.g. <span>) so they
 * don't survive into the DB and clutter the prose.
 */
function cleanStimulus(html: string): string {
  return html
    // Fill-in-the-blank accessibility pair → plain underscores
    .replace(
      /<span\s+aria-hidden="true">([_\s]+)<\/span>\s*<span\s+class="sr-only">\s*blank\s*<\/span>/gi,
      "______"
    )
    // Stray screen-reader-only spans (defensive)
    .replace(/<span\s+class="sr-only">[\s\S]*?<\/span>/gi, "")
    // Strip remaining span wrappers but keep their content
    .replace(/<\/?span[^>]*>/gi, "")
    .trim();
}

/**
 * The CB API returns the correct answer as the option's UUID, not as a
 * letter. Map it to A/B/C/D by position in the answerOptions array.
 */
function mapCorrectAnswerToLetter(
  answerOptions: { id: string }[],
  correctAnswerIds: string[]
): string | null {
  const correctId = correctAnswerIds[0];
  if (!correctId) return null;
  const idx = answerOptions.findIndex((o) => o.id === correctId);
  if (idx < 0 || idx > 3) return null;
  return ["A", "B", "C", "D"][idx];
}

/**
 * Strip outer <p> wrappers from short choice text. Keeps inline tags
 * (em, strong, u, i) intact. We allow <p> in the renderer for the
 * passage, but choices look better without paragraph wrappers.
 */
function cleanChoice(html: string): string {
  return html
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/^\s*<p>([\s\S]*?)<\/p>\s*$/i, "$1")
    .trim();
}

export interface TransformedQuestion {
  category: DsatCategory;
  passage_text: string;
  question_text: string;
  choices: { label: string; text: string }[];
  correct_answer: string;
  explanations: Record<string, string>;
  difficulty_rating: number;
  generated_by: string;
}

/**
 * Convert a College Board QBank question (index entry + detail) into the
 * shape our `questions` table expects. Returns null when the question
 * cannot be safely imported (image-based, non-mcq, malformed answer
 * mapping, etc.) so the importer can skip it.
 */
export function transformQbankQuestion(
  index: QbankIndexEntry,
  detail: QbankQuestionDetail
): TransformedQuestion | null {
  // Only multiple-choice questions are supported by our renderer.
  if (detail.type !== "mcq") return null;

  // Image-based questions don't render — CB marks them with a non-empty ibn.
  if (index.ibn) return null;

  // We need exactly 4 choices.
  if (!detail.answerOptions || detail.answerOptions.length !== 4) return null;

  const letter = mapCorrectAnswerToLetter(detail.answerOptions, detail.correct_answer);
  if (!letter) return null;

  const category = mapSkillToCategory(index.skill_cd, detail.stimulus ?? "");
  if (!category) return null;

  const passage = cleanStimulus(detail.stimulus ?? "");
  const stem = cleanStimulus(detail.stem ?? "");
  if (!passage || !stem) return null;

  const choices = detail.answerOptions.map((opt, i) => ({
    label: ["A", "B", "C", "D"][i],
    text: cleanChoice(opt.content),
  }));

  // CB only supplies one rationale (covering the correct answer).
  // Put it on the correct letter; leave others empty so the UI can still
  // show feedback without falsely claiming a per-choice explanation.
  const explanations: Record<string, string> = { A: "", B: "", C: "", D: "" };
  explanations[letter] = detail.rationale ?? "";

  return {
    category,
    passage_text: passage,
    question_text: stem,
    choices,
    correct_answer: letter,
    explanations,
    difficulty_rating: DIFFICULTY_MAP[index.difficulty] ?? 525,
    generated_by: "collegeboard",
  };
}
