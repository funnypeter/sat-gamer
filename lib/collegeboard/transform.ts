import type { DsatCategory } from "@/lib/constants";
import type {
  QbankIndexEntry,
  QbankQuestionDetail,
} from "./qbank-client";

/**
 * Coarse fallback when CB's finer-grained score_band_range_cd is missing.
 * Used only if the index entry doesn't include a usable band.
 */
const DIFFICULTY_LABEL_FALLBACK: Record<"E" | "M" | "H", number> = {
  E: 375,
  M: 525,
  H: 700,
};

/**
 * Map CB's score_band_range_cd (1-7) to a numeric difficulty rating
 * that lines up with our DIFFICULTY_BANDS in lib/constants.ts:
 *
 *   easy:   300-450  → bands 1, 2, 3 (300, 375, 450)
 *   medium: 450-600  → bands 3, 4, 5 (450, 525, 600)
 *   hard:   600-800  → bands 5, 6, 7 (600, 675, 750)
 *
 * Linear: rating = 300 + (band - 1) * 75. Gives 7 distinct values
 * evenly spread across the playable range, replacing the 3-bucket
 * E/M/H mapping that previously meant ~530 questions per bucket.
 */
function difficultyFromScoreBand(band: number | null | undefined): number | null {
  if (typeof band !== "number") return null;
  if (band < 1 || band > 7) return null;
  return 300 + Math.round((band - 1) * 75);
}

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
 * The CB stimulus uses several non-standard formatting conventions
 * that don't survive a naive sanitize pass:
 *
 *   1. Fill-in-the-blank: a visible underscore span plus a screen-
 *      reader-only "blank" span. Our renderer doesn't ship the
 *      sr-only CSS class, so the literal word "blank" leaks into the
 *      passage. Replace the whole pair with plain underscores.
 *
 *   2. Underlined "Referenced Content" portions in TSP questions.
 *      CB uses TWO different markups for this:
 *        a. <span role="region"><u>...</u></span> — has a real <u>
 *           inside, survives our span-stripper.
 *        b. <span style="text-decoration: underline;" ...>...</span>
 *           — uses inline CSS with NO <u> tag. If we just strip the
 *           span, the underline is lost and questions that ask "what
 *           is the function of the underlined sentence" become
 *           unanswerable. Convert these to <u>...</u> first.
 *
 *   3. Any remaining <span> wrappers — strip the tag itself but
 *      keep the inner content so prose isn't lost.
 */
function cleanStimulus(html: string): string {
  return html
    // 1. Fill-in-the-blank accessibility pair → plain underscores
    .replace(
      /<span\s+aria-hidden="true">([_\s]+)<\/span>\s*<span\s+class="sr-only">\s*blank\s*<\/span>/gi,
      "______"
    )
    // 1b. Stray screen-reader-only spans (defensive)
    .replace(/<span\s+class="sr-only">[\s\S]*?<\/span>/gi, "")
    // 2. CSS-underlined spans → <u> tags. Match any <span> whose style
    //    attribute contains "text-decoration: underline" (with or
    //    without spaces, and tolerating other style declarations).
    .replace(
      /<span\b[^>]*\bstyle\s*=\s*"[^"]*text-decoration\s*:\s*underline[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      "<u>$1</u>"
    )
    // 3. Strip remaining span wrappers but keep their content
    .replace(/<\/?span[^>]*>/gi, "")
    .trim();
}

/**
 * CB returns the correct answer as a letter directly in the
 * `correct_answer` field (e.g. ["A"]). The corresponding option UUID
 * lives separately in the `keys` field. Validate and return the letter.
 */
function mapCorrectAnswerToLetter(
  _answerOptions: { id: string }[],
  correctAnswer: string[]
): string | null {
  const value = correctAnswer?.[0];
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
    return upper;
  }
  return null;
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

export type TransformResult =
  | { ok: true; question: TransformedQuestion }
  | { ok: false; reason: string };

/**
 * Convert a College Board QBank question (index entry + detail) into the
 * shape our `questions` table expects. Returns `{ ok: false, reason }`
 * for questions that can't be safely imported so the caller can tally
 * rejection reasons for diagnostics.
 */
export function transformQbankQuestion(
  index: QbankIndexEntry,
  detail: QbankQuestionDetail
): TransformResult {
  if (detail.type !== "mcq") {
    return { ok: false, reason: `not_mcq:${detail.type}` };
  }
  if (index.ibn) {
    return { ok: false, reason: "image_based_ibn" };
  }
  if (!detail.answerOptions || detail.answerOptions.length !== 4) {
    return {
      ok: false,
      reason: `wrong_choice_count:${detail.answerOptions?.length ?? 0}`,
    };
  }

  const letter = mapCorrectAnswerToLetter(detail.answerOptions, detail.correct_answer);
  if (!letter) {
    return {
      ok: false,
      reason: `correct_answer_unmappable:${JSON.stringify(detail.correct_answer)}`,
    };
  }

  const category = mapSkillToCategory(index.skill_cd, detail.stimulus ?? "");
  if (!category) {
    return { ok: false, reason: `unknown_skill_cd:${index.skill_cd}` };
  }

  const passage = cleanStimulus(detail.stimulus ?? "");
  const stem = cleanStimulus(detail.stem ?? "");
  if (!passage) return { ok: false, reason: "empty_passage" };
  if (!stem) return { ok: false, reason: "empty_stem" };

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
    ok: true,
    question: {
      category,
      passage_text: passage,
      question_text: stem,
      choices,
      correct_answer: letter,
      explanations,
      difficulty_rating:
        difficultyFromScoreBand(index.score_band_range_cd) ??
        DIFFICULTY_LABEL_FALLBACK[index.difficulty] ??
        525,
      generated_by: "collegeboard",
    },
  };
}
