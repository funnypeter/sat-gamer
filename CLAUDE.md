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

### 2. Official College Board (`generated_by = 'collegeboard'`)
- Source: College Board's undocumented but public Digital QBank API at `qbank-api.collegeboard.org` (the same backend that powers `satsuitequestionbank.collegeboard.org`).
- `lib/collegeboard/qbank-client.ts` — typed client for the two endpoints (`get-questions` index, `get-question` detail). Polite throttling (5-way concurrency, 200ms inter-batch delay).
- `lib/collegeboard/transform.ts` — converts CB's HTML question shape into our `questions` row shape, maps `skill_cd` → DSAT category, maps the answer-id-as-UUID → A/B/C/D letter, and cleans CB's accessibility spans (`<span aria-hidden="true">______</span><span class="sr-only">blank</span>`) to plain `______`.
- `app/api/questions/import-cb/route.ts` — parent-only route. POST `{}` returns the list of domains; POST `{domain: 'INI'|'CAS'|'EOI'|'SEC'}` imports one whole domain and returns `nextDomain`. POST `{purge: true}` first wipes existing CB rows. Bound to `maxDuration = 60` (Hobby plan limit) — one domain per call so it fits.
- **Do not** revive PineSAT/OpenSAT (`pinesat.com/api/questions`). It mixes real CB questions with AI-generated `random_id_*` content, returns the literal string `"null"` for missing passages, and strips all underline markers. The dedicated client was deleted.

### Serving
- `app/api/questions/next/route.ts` serves the next question to a student based on Elo matching (`lib/engine/question-selector.ts`).
- `components/student/QuestionCard.tsx` renders it. Sanitizes HTML to allow `u/b/i/em/strong/br/p/sup/sub`. Has defensive rendering for the meta-prompt bug (see below).

## Known issue: meta-prompt passages

Gemini occasionally fills `passage_text` with a meta-description ("The author of this passage wants to...") instead of actual passage prose, producing unanswerable questions with no source text. **Defense is layered in three places — keep them in sync if patterns change**:

1. **Schema** (`lib/gemini/schema.ts`): Zod refinements on `passage_text` reject meta-prompt patterns and trailing `?`. Rejected rows never reach the DB.
2. **Renderer** (`components/student/QuestionCard.tsx`): `isMetaPromptPassage()` defensively detects bad rows already in the DB, hides the broken passage card, and renders the meta-prompt as the question stem with an amber "missing passage" notice.
3. **Migration** (`supabase/migrations/003_purge_meta_prompt_questions.sql`): one-shot cleanup of bad rows already inserted.

Patterns matched: `the author of (this|the) passage`, `the (writer|author|speaker) (wants|aims|intends|seeks)`, `this passage (is about|describes|discusses|argues|explains)`, `what is the most likely reason`, `which choice best`, and any `passage_text` ending in `?`. If new variants leak through, add them to all three locations.

## Conventions

- **HTML in passages**: `<u>` is used to mark "underlined portions" referenced by questions (Standard English Conventions, Text Structure & Purpose). The renderer's `sanitizeHtml` allows it.
- **Two Supabase clients**: `lib/supabase/server.ts` for user-scoped (RLS-enforced) reads; `lib/supabase/admin.ts` for service-role inserts (used by `/api/questions/generate` and seed routes). Never use the admin client in user-facing reads.
- **Migrations are numbered** (`001_`, `002_`, ...). Create new ones; never edit applied ones.
- **Supabase migrations don't auto-deploy with Vercel** — run `supabase db push` (or paste SQL into the Supabase dashboard) yourself after merging.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build (Vercel runs this)
- `npm run lint`

## Things to watch out for

- The `app/api/questions/generate` route uses the **admin client** — it must remain auth-gated (currently checks `supabase.auth.getUser()`).
- `ON DELETE CASCADE` is set on `student_questions.question_id`, so deleting from `questions` cleans up dependent rows automatically.
- DSAT categories are a closed set in `lib/constants.ts` — don't introduce new ones without updating prompts, the selector, and any UI that lists categories.
