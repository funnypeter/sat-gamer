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

CB-first means a student is always served authentic CB content when an Elo-appropriate one exists, before any AI-generated content. The `cbOnly` filter inside `findUnseen()` is the mechanism — it adds an `or("generated_by.eq.collegeboard,generated_by.eq.collegeboard-classified")` to the query.

### Earning rates — `app/api/sessions/answer/route.ts`

Per-question gaming-time reward by `difficulty_rating` bucket (constants in `lib/constants.ts`):
- `correctHard` (≥ 600): 0.75 min
- `correctMedium` (450-599): 0.5 min
- `correctEasy` (< 450): 0.25 min
- `incorrect`: 0 min

Capped at 45 minutes per rolling 7-day window (`DEFAULT_SETTINGS.weeklyCapMinutes`).

### Spaced repetition — `app/api/sessions/answer/route.ts:183-226`

Standard SM-2:
- **Wrong answer** → row scheduled for **tomorrow**, `interval_days = 1`, ease starts at 2.5 or decreases by 0.2 (floor 1.3).
- **Correct answer on a review** → `newInterval = round(interval * (ease + 0.1))`, ease grows up to 3.0.
- **Correct on first try** → no SR row created (the question won't be reviewed).
- No same-session or same-day retry — `next_review_date` is a date, set to "tomorrow" earliest.

### Rendering

- `components/student/QuestionCard.tsx` and `components/student/FeedbackOverlay.tsx` both render question content via `dangerouslySetInnerHTML` through the shared sanitizer in `lib/sanitize.ts` (allows `u/b/i/em/strong/br/p/sup/sub`).
- `FeedbackOverlay` calls `splitCbRationale()` (defined inline in that file) to break CB's monolithic "Choice X is the best answer... Choice Y is incorrect..." rationale into per-choice chunks at display time. Gemini explanations are already per-choice and pass through unchanged.
- `QuestionCard` has defensive rendering for the meta-prompt bug via `isMetaPromptPassage()` from `lib/sanitize.ts` (see below).

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
