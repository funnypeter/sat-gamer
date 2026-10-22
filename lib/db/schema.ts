// Column metadata the D1 query layer needs to make SQLite rows look like the
// Postgres rows the app was written against. Keep in sync with
// migrations/*.sql when adding columns.

/** jsonb columns: stored as TEXT, parsed on read, stringified on write. */
export const JSON_COLUMNS: Record<string, readonly string[]> = {
  families: ["settings"],
  questions: ["choices", "explanations", "accepted_answers"],
  vocab_items: ["choices", "explanations"],
  notifications: ["data"],
};

/** boolean columns: stored as 0/1, returned as true/false. */
export const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  users: ["show_question_timer"],
  student_questions: ["is_correct"],
  time_balances: ["redeemed"],
  notifications: ["read"],
  vocab_attempts: ["is_correct"],
  vocab_mastery: ["mastered"],
};

/** Tables whose primary key is not a generated `id` uuid. */
export const NO_GENERATED_ID = new Set(["push_config", "auth_users", "auth_sessions"]);

/**
 * Many-to-one embeds usable in select strings, e.g. `*, questions(category)`
 * on student_questions resolves through student_questions.question_id.
 */
export const RELATIONS: Record<string, Record<string, string>> = {
  student_questions: { questions: "question_id" },
  spaced_repetition: { questions: "question_id" },
  vocab_attempts: { vocab_items: "item_id" },
};

/**
 * Postgres generated `content_hash` columns (migrations 004, 007). Computed
 * in code with the identical formula so hashes of migrated rows still match
 * and the unique index keeps deduplicating.
 */
export const CONTENT_HASH: Record<string, (row: Record<string, unknown>) => string> = {
  questions: (r) => `${r.passage_text ?? ""}|${r.question_text}`,
  vocab_items: (r) => `${r.word}|${r.sentence}`,
};
