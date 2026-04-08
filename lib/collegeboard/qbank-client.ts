/**
 * Client for College Board's official Digital SAT Question Bank API.
 *
 * This is the same backend that powers https://satsuitequestionbank.collegeboard.org.
 * It is undocumented but public (no auth, no API key) and returns rich,
 * properly-formatted question data — passages with HTML markup, answer
 * options, rationales, and the official correct answer mapping.
 *
 * Two endpoints:
 *   - get-questions: returns the index (metadata) for a domain
 *   - get-question:  returns full content for a single external_id
 *
 * Be a polite client: this is College Board's infrastructure. Throttle
 * detail fetches, do one-shot imports rather than runtime calls, and
 * cache results aggressively in our own database.
 */

const QBANK_BASE = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital";

/** Domain codes for the SAT Reading & Writing section. */
export const RW_DOMAINS = ["INI", "CAS", "EOI", "SEC"] as const;
export type RwDomain = (typeof RW_DOMAINS)[number];

/** A row from the question index endpoint. Metadata only — no content. */
export interface QbankIndexEntry {
  external_id: string;
  questionId: string;
  primary_class_cd: string;       // INI / CAS / EOI / SEC
  primary_class_cd_desc: string;
  skill_cd: string;                // CID / COE / INF / CTC / TSP / WIC / SYN / TRA / BOU / FSS
  skill_desc: string;
  difficulty: "E" | "M" | "H";
  score_band_range_cd: number;
  program: string;                 // "SAT"
  ibn: string | null;              // non-null/non-empty seems to indicate special-format questions
}

/** A full question from the detail endpoint. Content is HTML strings. */
export interface QbankAnswerOption {
  id: string;
  content: string;                 // HTML, e.g. "<p>writers,</p>"
}

export interface QbankQuestionDetail {
  externalid: string;
  stem: string;                    // HTML — the question text
  stimulus: string;                // HTML — the passage / prompt prose
  rationale: string;               // HTML — explanation of the correct answer
  answerOptions: QbankAnswerOption[];
  correct_answer: string[];        // array of answerOption ids (typically length 1)
  type: string;                    // "mcq" for the questions we want
  origin: string;
  vaultid: string;
  templateclusterid: string;
  parenttemplatename: string;
  parenttemplateid: string;
  templateclustername: string;
  position: string;
  keys: string[];
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${QBANK_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // College Board's edge sometimes 403s requests with no UA.
      "User-Agent": "sat-gamer/1.0 (+importer)",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    // Don't let Next.js cache mutating-shape POSTs across imports.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `College Board QBank ${path} failed: ${res.status} ${res.statusText}`
    );
  }

  return (await res.json()) as T;
}

/**
 * Fetch the index (metadata only) for every question in a given R&W domain.
 * One call returns hundreds of rows. No throttling needed.
 */
export async function fetchQuestionIndex(
  domain: RwDomain
): Promise<QbankIndexEntry[]> {
  return postJson<QbankIndexEntry[]>("get-questions", {
    asmtEventId: 99, // SAT
    test: 1,         // Reading & Writing (use 2 for Math)
    domain,
  });
}

/**
 * Fetch full question content (passage, choices, rationale) for one external_id.
 * Throttle calls when fetching many — see fetchAllQuestionDetails().
 */
export async function fetchQuestionDetail(
  externalId: string
): Promise<QbankQuestionDetail> {
  return postJson<QbankQuestionDetail>("get-question", {
    external_id: externalId,
  });
}

/**
 * Fetch full content for many questions with polite throttling.
 *
 * Runs `concurrency` requests in parallel, then waits `delayMs` before the
 * next batch. Skips and logs failures rather than aborting the whole run.
 */
export async function fetchAllQuestionDetails(
  externalIds: string[],
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<{ details: QbankQuestionDetail[]; failed: string[] }> {
  const concurrency = options.concurrency ?? 5;
  const delayMs = options.delayMs ?? 200;

  const details: QbankQuestionDetail[] = [];
  const failed: string[] = [];

  for (let i = 0; i < externalIds.length; i += concurrency) {
    const batch = externalIds.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((id) => fetchQuestionDetail(id))
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        details.push(r.value);
      } else {
        failed.push(batch[j]);
      }
    }
    if (i + concurrency < externalIds.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { details, failed };
}
