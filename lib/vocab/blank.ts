/**
 * The blank marker used in stored vocabulary sentences.
 *
 * Lives in its own dependency-free module because both the server-side
 * validator (`schema.ts`, which pulls in zod) and the client components
 * (`VocabCard`, `VocabFeedback`) need it. Importing it from `schema.ts`
 * bundled zod into the client for the sake of one six-character string and
 * quadrupled the vocab page's JS. Keep this file free of imports.
 */
export const BLANK = "______";

/** Matches any run of 3+ underscores, so a model that writes ____ still parses. */
export const BLANK_RUN = /_{3,}/g;
