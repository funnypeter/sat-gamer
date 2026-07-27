# SAT Gamer

Digital SAT (DSAT) Reading & Writing prep app. Students earn gaming time by answering questions; parents oversee progress.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind**
- **Supabase** (Postgres + RLS + auth) — schema in `supabase/migrations/`
- **Google Gemini** for question generation (`@google/generative-ai`)
- **Zustand** for client state
- **Zod** for validation
- Deployed on **Vercel**, with `master` as the deploy branch

## Repo layout

```
app/
  (auth)/         login, signup, etc.
  (student)/      student dashboard, practice, review, leaderboard, profile, redeem
  (parent)/       parent-side views
  api/
    questions/    generate, next, prefetch, seed, import-cb, stats
    sessions/     practice session lifecycle
    students/     student CRUD for parents
    auth/  avatar/  redeem/  debug/
components/
  student/        QuestionCard, FeedbackOverlay, PracticeTimer, StreakBadge, ...
  parent/  shared/
lib/
  gemini/         client.ts, prompts.ts, schema.ts
  engine/         elo.ts, question-selector.ts, streak.ts, time-calculator.ts
  supabase/       server.ts (RLS), admin.ts (service role), browser client
  collegeboard/   College Board question importer
  constants.ts    DSAT_CATEGORIES, DIFFICULTY_BANDS
  types/          database types
stores/           Zustand stores
supabase/migrations/   numbered SQL migrations
```

## Question pipeline

There are **two question sources**, both insert into the same `questions` table:

### 1. Gemini-generated (`generated_by = 'gemini'`)
- `lib/gemini/prompts.ts` builds a category- and difficulty-specific prompt.
- `app/api/questions/generate/route.ts` calls Gemini, parses JSON, validates with `GeneratedQuestionsArraySchema` from `lib/gemini/schema.ts` (which rejects meta-prompt passages), then inserts via the **admin client** (bypasses RLS).

### 2. Official College Board (`generated_by = 'collegeboard'` or `'collegeboard-classified'`)
- Source: College Board's undocumented but public Digital QBank API at `qbank-api.collegeboard.org` (the same backend that powers `satsuitequestionbank.collegeboard.org`). No auth required. ~1,590 R&W questions across 4 domains.
- `lib/collegeboard/qbank-client.ts` — typed client for the two endpoints (`get-questions` index, `get-question` detail). Polite throttling (5-way concurrency, 200ms inter-batch delay).
- `lib/collegeboard/transform.ts` — converts CB's HTML question shape into our `questions` row shape:
  - **Category mapping**: by granular `skill_cd`, not the broad 4-domain `primary_class_cd`. The 10 skill codes map 1-to-1 to our 10 DSAT categories (CID→Central Ideas & Details, COE→Command of Evidence, INF→Inferences, CTC→Cross-Text Connections, TSP→Text Structure & Purpose, WIC→Words in Context, SYN→Rhetoric, TRA→Transitions, BOU and FSS→Standard English Conventions). COE is split into Textual vs Quantitative via a `<table>` heuristic on the stimulus.
  - **Difficulty**: uses CB's `score_band_range_cd` (1-7) mapped linearly via `300 + (band - 1) * 75`, giving 7 distinct rating values across 300-750. Falls back to the coarse E/M/H label only when score_band is missing.
  - **Correct answer**: CB returns `correct_answer: ["A"|"B"|"C"|"D"]` directly as a letter (NOT the option UUID — the UUIDs live in the separate `keys` field).
  - **HTML cleanup** (`cleanStimulus()`): three transforms, in order:
    1. Replace the fill-in-the-blank accessibility pair (`<span aria-hidden="true">______</span><span class="sr-only">blank</span>`) with plain `______` so the screen-reader-only "blank" text doesn't leak into the visible passage.
    2. **Promote inline-style underlines to `<u>` tags.** CB marks the "Referenced Content" portion in Text Structure & Purpose questions in *two* different ways: (a) `<span role="region"><u>...</u></span>` which has a real `<u>` inside and survives the span-stripper, and (b) `<span style="text-decoration: underline;" ...>...</span>` which uses inline CSS with no `<u>` tag. We must convert (b) to `<u>...</u>` *before* stripping spans, otherwise questions asking about "the underlined sentence" become unanswerable.
    3. Strip remaining `<span>` wrappers but keep their inner content.
  - **Filter**: rejects image-based questions (non-empty `ibn` field) and non-mcq question types. Returns `{ ok: false, reason }` for diagnostics so the importer can tally rejection reasons.
- `app/api/questions/import-cb/route.ts` — parent-only route. POST `{}` returns the list of domains; POST `{domain: 'INI'|'CAS'|'EOI'|'SEC'}` imports one whole domain and returns `nextDomain` plus a `rejections` breakdown. POST `{purge: true}` first wipes existing CB rows. Bound to `maxDuration = 60` (Hobby plan limit) — one domain per call so it fits.
- `components/parent/ImportQuestionsButton.tsx` — UI that iterates the four domains sequentially, shows per-domain progress + rejection counts, and exposes a "Delete existing first" checkbox.
- **Do not** revive PineSAT/OpenSAT (`pinesat.com/api/questions`). It mixes real CB questions with AI-generated `random_id_*` content, returns the literal string `"null"` for missing passages, and strips all underline markers. The dedicated client was deleted.

### Serving — `app/api/questions/next/route.ts`

The route delegates to `selectNextQuestion()` in `lib/engine/question-selector.ts`, which is the **single source of truth** for question selection. The route only handles the Gemini-generation fallback when the selector returns null. Do not re-introduce inline selection logic in the route.

The selector cascade (first match wins):
1. **Spaced repetition** items due today (any source) — see `app/api/sessions/answer/route.ts` for how SR rows are created.
2. **CB-first** in weakest categories within the student's Elo band (±150 around average rating of the 3 weakest categories).
3. **CB** in any category within Elo band.
4. Any source in weakest categories within Elo band.
5. Any source in any category within Elo band.
6. Any unseen question at any difficulty (last-resort, only if Elo band is empty).
7. Returns null → route triggers Gemini generation targeting a weak category at the right difficulty band.
8. Only if generation *fails* does the route call the selector again with `{ allowRepeats: true }`, re-serving an already-answered question (never one from the current session), always with shuffled choices.

The cascade itself never re-serves answered questions — steps 2-6 filter to never-answered only. Previously-answered questions come back solely via spaced repetition (step 1) or the step-8 fallback.

**Shuffled servings and `choiceMap`**: SR reviews and repeat fallbacks are served with shuffled, re-labeled choices plus a `choiceMap` (displayed label → original label). The client must translate the student's pick back to original-label space before POSTing to `/api/sessions/answer`, and translate `correctAnswer`/`explanations` in the response back to displayed space. The map is kept in the Zustand session store **next to `currentQuestion`** (set atomically via `setCurrentQuestion(question, choiceMap)`) — never in page-local state, which resets on remount while the store's question survives, silently grading against the wrong letters.

CB-first means a student is always served authentic CB content when an Elo-appropriate one exists, before any AI-generated content. The `cbOnly` filter inside `findUnseen()` is the mechanism — it adds an `or("generated_by.eq.collegeboard,generated_by.eq.collegeboard-classified")` to the query.

### AI tutor — `app/api/questions/explain/route.ts`

The "Ask Gemini" chat, opened from `FeedbackOverlay` (practice) and `ReviewCard` (review).

- **Replies stream.** The route returns a `ReadableStream` of plain text from `sendMessageStream`; the client reads `res.body` and appends chunks as they arrive. Don't revert it to a JSON `{ reply }` payload — the wait is several seconds and a spinner reads as a hang.
- **Thinking is disabled** (`generationConfig.thinkingConfig.thinkingBudget: 0`). 2.5 Flash spends output tokens on internal thinking before it writes anything, so a small `maxOutputTokens` gets consumed by reasoning and the visible reply stops mid-sentence. `thinkingConfig` isn't in the 0.x SDK's types so it's cast; if the endpoint ever rejects it, the route retries once without it and with a much larger token budget.
- **Shuffled servings**: the client passes the `choiceMap` alongside `questionId`. The route remaps choices, correct answer, explanations, and the student's own answer into displayed-label space — without it the tutor reasons about letters the student never saw.
- The system prompt deliberately forbids paraphrasing the official College Board rationale. The student is in the chat *because* that rationale didn't land; restating it is the top complaint.

### Earning rates — `app/api/sessions/answer/route.ts`

Per-question gaming-time reward by `difficulty_rating` bucket (constants in `lib/constants.ts`):
- `correctHard` (≥ 600): 0.75 min
- `correctMedium` (450-599): 0.5 min
- `correctEasy` (< 450): 0.25 min
- `incorrect`: 0 min

Capped at 45 minutes per rolling 7-day window (`DEFAULT_SETTINGS.weeklyCapMinutes`).

**This route sits between "Submit" and the feedback screen, so it is latency-critical.** Reads run in two `Promise.all` batches and all writes in a third; nothing is awaited serially without reason. It used to re-categorize CB questions with a blocking Gemini call on the first answer to each one, which put a multi-second AI round-trip in front of every feedback screen — and was redundant, since the importer already derives the category from CB's granular `skill_cd`. **Never put an AI call in this path.**

### Spaced repetition — `app/api/sessions/answer/route.ts:185-218`

Single-pass review (not full SM-2):
- **Wrong answer** → row scheduled for **tomorrow**, `interval_days = 1`, ease starts at 2.5 or decreases by 0.2 (floor 1.3).
- **Correct answer on a review** → SR row **deleted**. The question is retired from rotation; once proved learned, it isn't cycled again. The original miss still lives in `student_questions`, so the Review page's history is intact.
- **Correct on first try** → no SR row created.
- No same-session or same-day retry — `next_review_date` is a date, set to "tomorrow" earliest.

### Rendering

- `components/student/QuestionCard.tsx` and `components/student/FeedbackOverlay.tsx` both render question content via `dangerouslySetInnerHTML` through the shared sanitizer in `lib/sanitize.ts` (allows `u/b/i/em/strong/br/p/sup/sub`).
- `FeedbackOverlay` calls `splitCbRationale()` (defined inline in that file) to break CB's monolithic "Choice X is the best answer... Choice Y is incorrect..." rationale into per-choice chunks at display time. Gemini explanations are already per-choice and pass through unchanged.
- `QuestionCard` has defensive rendering for the meta-prompt bug via `isMetaPromptPassage()` from `lib/sanitize.ts` (see below).
- `QuestionStopwatch` **freezes at submit** (`stopAt` prop, set from the same timestamp used for `timeSpentSeconds`). Server round-trip is not thinking time, and a clock that keeps running past submit reads as the app charging you for its own latency.

## Known issue: meta-prompt passages

Gemini occasionally fills `passage_text` with a meta-description ("The author of this passage wants to...") instead of actual passage prose, producing unanswerable questions with no source text. **Defense is layered in three places — keep them in sync if patterns change**:

1. **Schema** (`lib/gemini/schema.ts`): Zod refinements on `passage_text` reject meta-prompt patterns and trailing `?`. Rejected rows never reach the DB.
2. **Renderer** (`components/student/QuestionCard.tsx`): `isMetaPromptPassage()` defensively detects bad rows already in the DB, hides the broken passage card, and renders the meta-prompt as the question stem with an amber "missing passage" notice.
3. **Migration** (`supabase/migrations/003_purge_meta_prompt_questions.sql`): one-shot cleanup of bad rows already inserted.

Patterns matched: `the author of (this|the) passage`, `the (writer|author|speaker) (wants|aims|intends|seeks)`, `this passage (is about|describes|discusses|argues|explains)`, `what is the most likely reason`, `which choice best`, and any `passage_text` ending in `?`. If new variants leak through, add them to all three locations.

## Conventions

- **HTML in passages**: `<u>` marks "underlined portions" referenced by questions (Standard English Conventions, Text Structure & Purpose). CB also wraps prose paragraphs in `<p>`. The shared sanitizer in `lib/sanitize.ts` is the single source of truth for the allowlist — every component that renders question HTML should import `sanitizeHtml` from there, never define its own.
- **Two Supabase clients**: `lib/supabase/server.ts` for user-scoped (RLS-enforced) reads; `lib/supabase/admin.ts` for service-role inserts (used by `/api/questions/generate`, import-cb, and seed routes). Never use the admin client in user-facing reads.
- **Migrations are numbered** (`001_`, `002_`, ...). Create new ones; never edit applied ones.
- **Supabase migrations don't auto-deploy with Vercel** — run `supabase db push` (or paste SQL into the Supabase dashboard) yourself after merging.
- **The route at `/api/questions/next` must not duplicate selection logic** — it delegates to `selectNextQuestion()` and only handles Gemini fallback. If you need to change selection priority, change the selector, not the route.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build (Vercel runs this)
- `npm run lint`

## Things to watch out for

- The `app/api/questions/generate` route uses the **admin client** — it must remain auth-gated (currently checks `supabase.auth.getUser()`).
- `ON DELETE CASCADE` is set on `student_questions.question_id`, so deleting from `questions` cleans up dependent rows automatically.
- DSAT categories are a closed set in `lib/constants.ts` — don't introduce new ones without updating prompts, the selector, and any UI that lists categories.
