# SAT Gamer

Digital SAT (DSAT) prep app for both sections, Reading & Writing ("verbal") and Math. Students earn gaming time by answering questions; parents oversee progress.

Two practice modes: **section questions** (`/practice`, where the student picks Reading & Writing or Math) and **vocabulary drilling** (`/vocab`). They share the session, earning, and streak machinery but have separate content pipelines, separate progress tracking, and separate reporting. See "Math" below for how the two sections share one question pipeline.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind**, React 19
- **Cloudflare Workers** via OpenNext (`@opennextjs/cloudflare`), live at **https://satgamer.pmansour.com** (Worker `sat-gamer`)
- **D1** (SQLite) database `sat-gamer` — schema in `migrations/`; **R2** bucket `sat-gamer-avatars` for profile photos
- Email + password auth on D1 (`lib/auth.ts`), cookie sessions
- **Google Gemini** for question generation (`@google/generative-ai`); key is the Worker secret `GEMINI_API_KEY`
- **Zustand** for client state
- **Zod** for validation

Moved off Vercel + Supabase in Oct 2026. `supabase/migrations/` is kept only as the history of the original Postgres schema — don't add to it.

## Repo layout

```
app/
  (auth)/         login, signup, etc.
  (student)/      student dashboard, practice, vocab, review, leaderboard, profile, redeem
  (parent)/       parent-side views
  api/
    questions/    generate, next, prefetch, seed, import-cb, stats, explain
    vocab/        next, answer, generate, explain
    sessions/     practice session lifecycle (shared by both modes)
    students/     student CRUD for parents
    auth/  avatar/  redeem/  debug/
components/
  student/        QuestionCard, FeedbackOverlay, VocabCard, VocabFeedback, PracticeTimer, ...
  parent/  shared/
lib/
  gemini/         client.ts, prompts.ts, schema.ts
  engine/         elo.ts, question-selector.ts, streak.ts, time-calculator.ts
  vocab/          word-list.ts, select.ts, mastery.ts, distractors.ts,
                  generate.ts, prompts.ts, schema.ts, blank.ts
  db/             D1 query layer: index.ts (createClient/createAdminClient),
                  query.ts (supabase-js-compatible builder), schema.ts (JSON/bool columns)
  auth.ts         sessions, password hashing, sign in/out
  signup.ts       shared account creation for signup/join/students-create
  cf.ts           Cloudflare bindings (env(), d1())
  collegeboard/   College Board question importer
  constants.ts    DSAT_CATEGORIES, DIFFICULTY_BANDS, VOCAB_EARNING_RATES, VOCAB_MASTERY
  types/          database types
stores/           Zustand stores (session-store, vocab-store)
migrations/       numbered D1 migrations (wrangler)
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
- `app/api/questions/import-cb/route.ts` — parent-only route. POST `{}` returns the list of domains; POST `{domain: 'INI'|'CAS'|'EOI'|'SEC'}` imports one whole domain and returns `nextDomain` plus a `rejections` breakdown. POST `{purge: true}` first wipes existing CB rows. One domain per call (`maxDuration` is a leftover from Vercel's limit; Workers has no wall-clock cap while the client is connected, but one-domain chunks keep each request short).
- `components/parent/ImportQuestionsButton.tsx` — UI that iterates the four domains sequentially, shows per-domain progress + rejection counts, and exposes a "Delete existing first" checkbox.
- **Do not** revive PineSAT/OpenSAT (`pinesat.com/api/questions`). It mixes real CB questions with AI-generated `random_id_*` content, returns the literal string `"null"` for missing passages, and strips all underline markers. The dedicated client was deleted.

### Serving — `app/api/questions/next/route.ts`

The route delegates to `selectNextQuestion()` in `lib/engine/question-selector.ts`, which is the **single source of truth** for question selection. The route only handles the Gemini-generation fallback when the selector returns null. Do not re-introduce inline selection logic in the route.

The selector cascade (first match wins):
1. **Spaced repetition** items due today (any source) — see `app/api/sessions/answer/route.ts` for how SR rows are created.
2. **CB-first** in a **randomly rolled category** (`pickTargetCategory()`), within that category's own Elo band (±150).
3. Any source in that same rolled category, same band.
4. **CB** in any category within the overall Elo band (±150 around the average of all category ratings).
5. Any source in any category within the overall band.
6. Any unseen question at any difficulty (last-resort, only if the Elo band is empty).
7. Returns null → route triggers Gemini generation for a randomly rolled category at that category's difficulty band.
8. Only if generation *fails* does the route call the selector again with `{ allowRepeats: true }`, re-serving an already-answered question (never one from the current session), always with shuffled choices.

The cascade itself never re-serves answered questions — steps 2-6 filter to never-answered only. Previously-answered questions come back solely via spaced repetition (step 1) or the step-8 fallback.

**Category is random; difficulty is adaptive.** The selector used to weight toward the student's weakest categories (a `pickLaggardCategory()` draw over the bottom 3 by Elo). That concentrated a session on three of ten skills and left the rest barely drilled — the DSAT scores all ten, so coverage wins. `pickTargetCategory()` now draws uniformly across `DSAT_CATEGORIES` and is re-rolled per question, while the Elo band is still taken from *that category's* own rating, so the level still adapts. Missed questions still come back through spaced repetition (step 1), which is untouched. `/api/questions/prefetch` uses the same uniform draw — leaving it weak-category-weighted would rebuild the bias in the generated pool the selector falls back on.

**Shuffled servings and `choiceMap`**: SR reviews and repeat fallbacks are served with shuffled, re-labeled choices plus a `choiceMap` (displayed label → original label). The client must translate the student's pick back to original-label space before POSTing to `/api/sessions/answer`, and translate `correctAnswer`/`explanations` in the response back to displayed space. The map is kept in the Zustand session store **next to `currentQuestion`** (set atomically via `setCurrentQuestion(question, choiceMap)`) — never in page-local state, which resets on remount while the store's question survives, silently grading against the wrong letters.

CB-first means a student is always served authentic CB content when an Elo-appropriate one exists, before any AI-generated content. The `cbOnly` filter inside `findUnseen()` is the mechanism — it adds an `or("generated_by.eq.collegeboard,generated_by.eq.collegeboard-classified")` to the query.

### AI tutor — `app/api/questions/explain/route.ts` and `app/api/vocab/explain/route.ts`

The "Ask Gemini" chat, opened from `FeedbackOverlay` (practice), `ReviewCard` (review), and `VocabFeedback` (vocabulary).

**One component, two routes.** `AskGeminiChat` owns the transport, streaming, and chrome for both; the caller passes `endpoint` and a `payload` that gets spread into the request body (`{ questionId, choiceMap }` for passages, `{ itemId }` for vocabulary). Don't fork the component to add a content type — add a route and a payload shape, or streaming bugs have to be fixed twice.

The two routes share the streaming and thinking-disabled decisions below, and differ only in grounding and brief. The vocabulary brief's central rule is the direct analogue of the passage one: **never just restate the definition.** The student saw the definition and the per-choice notes on the feedback screen and opened the chat anyway, so the gloss is the thing that already failed. It's told to teach the word another way — the situations it shows up in, what it's the opposite of, a concrete hook — and to contrast words directly when asked "why not this one?".

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

## Math

Math rides the passage-question pipeline end to end — same `questions` table, selector, Elo, spaced repetition, earning rates and weekly cap. What separates the sections:

- **`questions.subject`** (`'verbal' | 'math'`) and **`sessions.subject`**. The student picks a section on `/practice`; `/api/sessions/start` stores it on the session, and `/api/questions/next` reads it back from the session row (the `?subject=` param is only a fallback). `selectNextQuestion(..., { subject })` scopes **every** tier to that subject, including spaced repetition, so a miss comes back in the section it was missed in. `sessions.mode` stays `'practice'` for both; don't widen its CHECK (SQLite can't alter a CHECK without rebuilding the table).
- **Categories** are the four SAT Math domains (`MATH_CATEGORIES`: Algebra, Advanced Math, Problem-Solving & Data Analysis, Geometry & Trigonometry), mapped from CB's domain code H/P/Q/S. Deliberately coarser than the ten verbal skills — CB's 19 math skills would leave each Elo with too few answers to mean anything. `pickTargetCategory(subject)` rolls uniformly within the section. Use `categoriesFor()` / `subjectOfCategory()` from `lib/constants.ts` rather than `DSAT_CATEGORIES` anywhere both sections matter.
- **Reporting keeps the sections apart.** Elo averages and category breakdowns are per section (student dashboard, parent detail page). One blended Elo would describe neither skill.
- **Source**: College Board only, via the same importer (`/api/questions/import-cb` with domains `H`/`P`/`Q`/`S`, `test: 2` on CB's API; `transformQbankMathQuestion` in `lib/collegeboard/transform.ts`). **No Gemini generation for math** — a model-written math item with a wrong key is worse than a repeat, and the prompts/schema are passage-shaped. When a math student exhausts the bank, `/api/questions/next` goes straight to repeats; the client only calls `/api/questions/prefetch` (verbal generation) for verbal sessions.
- **Graphs and diagrams are skipped** at import (inline SVG / `<figure>` / `<img>`, or CB's `ibn` flag): the sanitizer doesn't render them, so the question would be unanswerable. That's about 40% of CB's math bank (Oct 2026: 1,137 of 1,925 imported). `ibn` questions also fail CB's `get-question` call, so they show up as `failedFetches` in the import result, not as rejections. Supporting them means allowing a vetted SVG subset in `lib/sanitize.ts`.

### MathML

CB writes all math as MathML, rendered natively by the browser.

- `lib/sanitize.ts` allows the MathML Core elements and only presentation attributes (`alttext`, `mathvariant`, …); everything else is stripped from every tag, HTML or MathML.
- **`<mfenced>` must be rewritten** — MathML Core dropped it, and Chrome renders its contents with the parentheses silently missing ("f(x)" → "fx", "(3, 4)" → "34"). `replaceMfenced()` in `lib/mathml.ts` converts it to `<mrow><mo>(</mo>…<mo>)</mo></mrow>`, keeping `open`/`close`/`separators`. The importer stores the rewritten form, and the sanitizer applies it again defensively.
- Content that reaches Gemini (the AI tutor) goes through `mathToText()`, which swaps each `<math>` for its `alttext`. Stripping tags alone runs numbers together ("3/4" → "34").
- Question HTML renders inside `.question-html` (styles in `app/globals.css`), as a `div` not a `p` — math stems can contain tables.

### Grid-ins (`answer_format = 'spr'`)

CB's "student-produced response" questions have no choices; the student types the answer.

- Stored with `choices = []`, every accepted form in **`accepted_answers`** (JSON, e.g. `["3/2","1.5"]`), the first one in `correct_answer` for display, and CB's worked solution in `explanations.answer`.
- Graded by **`isSprAnswerCorrect()`** in `lib/math-answer.ts`: an exact match to an accepted form, or the same *exact* numeric value ("6/4" = "3/2" = "1.50"). No tolerance — on the real test 0.67 isn't accepted for 2/3, and CB already lists the rounded/truncated decimals it does accept.
- `accepted_answers` is the answer key: `/api/questions/next` never sends it (see `stripAnswer`); `/api/sessions/answer` returns it with the result.
- No `choiceMap`: grid-ins are never shuffled, on SR reviews or repeats.

## Vocabulary mode

Sentence-completion drilling over a fixed curated word list. `/vocab` for the student, "Vocabulary Bank" in parent Settings to build the content.

### The split that makes this work

The word list is **code**; the sentences are **data**.

- `lib/vocab/word-list.ts` — ~335 words with part of speech, definition, tier (1-3), and a coarse `sense` cluster. In the repo, not the DB, so mastery has a stable denominator ("112 of 335") and the list is reviewable in version control.
- `vocab_items` (Postgres) — Gemini-authored sentences, several variants per word, so a re-drilled word appears in fresh context rather than a remembered sentence.

Gemini writes **only the sentence and one note per wrong choice**. The word, definition, all four choices, and which one is correct are decided in code before the prompt is built. That's why vocabulary needs nothing like the three-layer meta-prompt defense the passage pipeline needs — the model has no opportunity to mislabel an answer or invent a definition.

### Distractors — `lib/vocab/distractors.ts`

Wrong answers are real words from the same list, under two constraints that exist because breaking either yields an item with no defensible answer:

1. **Same part of speech.** Otherwise grammar alone solves it.
2. **Different `sense` tag.** This is what stops "obdurate" being offered against "intransigent". When adding words to the list, **tag any near-synonym** — an untagged synonym pair is the one way to produce an unanswerable item.

Tier proximity is a preference, not a constraint (the noun pool is too small to guarantee it). Selection is seeded by `(word, variantIndex)`, so regenerating a variant reselects the same distractors and generation stays idempotent.

`unsuitable_distractors` in the model's response is a third guard: `sense` is coarse, and only the model can see the sentence it just wrote. Flagged items are **discarded, not repaired**.

### Selection — `lib/vocab/select.ts`

Single source of truth, same convention as `question-selector.ts`. `/api/vocab/next` delegates and only handles the generation fallback.

Cascade: due reviews → **due mastered refreshers** → new words (under the in-flight cap) → pulled-forward reviews → new-word overflow → any mastered refresher → anything at all.

- **`IN_FLIGHT_LIMIT = 20`** caps how many words are being learned at once. Without it the selector introduces a new word every rep — a week of practice meets 200 words once each and learns none.
- **Due refreshers sit above new words** (step 2). Below them they would never fire — unseen words outnumber due refreshers for months. They can't crowd out new material either: a mastered word can't come due more than once every three weeks.
- **Steps 4-6 exclude words already answered today.** This is load-bearing, not politeness: mastery is 3 consecutive correct, so without it a student at the cap gets the same word three times in ten minutes and "masters" it on short-term recall alone. The final step drops the filter so a long session never dead-ends.
- **Ties inside every step are shuffled.** Each list is passed through `shuffled()` before it's sorted; `Array.prototype.sort` is stable, so the tier order survives and only the ties are randomized. Without it the sort keys (tier, due date, last-seen) left new words in word-list order — which is alphabetical, so a new student's first week was `abase, abate, abdicate, aberrant…`. The comparators return `0` on a tie for this reason; a comparator that returns a constant `1` instead would undo the shuffle.

### Mastery & spacing — `lib/vocab/mastery.ts`

Scheduled by **word**, not by item (unlike `spaced_repetition`, which is per question id) — the unit being learned is the word; the sentence is disposable.

- 3 consecutive correct → mastered. Frees an in-flight slot (the cap counts unmastered words only) but **does not retire the word** — it moves to a long refresher schedule of 21 / 45 / 90 days, widening each time it's re-proved.
- Any miss, including on a refresher → streak resets, un-masters, back tomorrow on the 1/3/7 schedule.
- Learning intervals (1/3/7 days) are scaled by an ease factor that moves ±0.1/0.2 per answer, so a word that keeps causing trouble returns sooner than one that doesn't. Mastered intervals are **not** ease-scaled — at three weeks and up the nudge is noise.

Mastered words were originally retired outright (`next_review_date = null`, surfaced only once the whole list was exhausted, i.e. never). Three correct answers inside a fortnight proves recent recall, not durable memory, so learned words now recur — rarely. Migration `008` backfills rows mastered under the old rule, spreading their due dates across three weeks so a cohort doesn't all land in one session.

Note this differs from the question flow deliberately: questions delete the SR row on the *first* correct review. One correct answer among four choices isn't evidence a word is learned.

### Earning & reporting

- **0.1 min per correct rep** (`VOCAB_EARNING_RATES`), against the **same** weekly cap and the same `time_balances` table — one pool of gaming time, not two. The rate is low on purpose: a vocab rep is seconds where a passage question is a minute, so equal pay would make vocabulary the cheapest route to the cap and passage practice would stop.
- `sessions.mode` (`'practice' | 'vocab'`) keeps the two apart. Vocab reps **do** increment `sessions.total_questions` — that's what makes `/api/sessions/end` credit the streak — so anything reporting passage accuracy must filter `mode = 'practice'`, as the student dashboard does. Averaging a 90%-accurate vocab session into passage accuracy hides the weakness the dashboard exists to surface.
- Vocabulary deliberately **does not touch `student_stats` / Elo**. That Elo targets College Board questions by difficulty band; feeding single-word items into it would mis-target passage practice.

### Building the bank

`/api/vocab/generate` is background-only — never between Submit and feedback (same rule as `/api/sessions/answer`). Two callers: the parent Settings button, which loops one request per chunk because a single invocation is capped at 60s; and the vocab page, which builds the exact words the selector wanted when it comes up empty, then retries.

`targetPerWord` is a **pass number**, not a batch size. Pass 1 gives every word one sentence (enough to drill the whole list); passes 2-3 add the variants that prevent repeats. Pass 1 alone is a usable state — the student page tops up in the background as it goes.

### Gotchas

- **`BLANK` lives in `lib/vocab/blank.ts`, not `schema.ts`.** Client components need it, and importing from `schema.ts` drags zod into the browser bundle — that alone took `/vocab` from 4.8 kB to 30.5 kB. Keep `blank.ts` import-free.
- **Vocabulary has no `choiceMap`.** Items are shuffled once at generation time and stored that way, never re-shuffled at serve time, so displayed labels always equal stored labels. Don't add the translation layer the passage flow needs — and note `/api/vocab/explain` therefore takes no `choiceMap` either.
- **Sentences are plain text**, rendered without `dangerouslySetInnerHTML`. If they ever carry markup, route them through `lib/sanitize.ts` like `QuestionCard` does.

## Known issue: meta-prompt passages

Gemini occasionally fills `passage_text` with a meta-description ("The author of this passage wants to...") instead of actual passage prose, producing unanswerable questions with no source text. **Defense is layered in three places — keep them in sync if patterns change**:

1. **Schema** (`lib/gemini/schema.ts`): Zod refinements on `passage_text` reject meta-prompt patterns and trailing `?`. Rejected rows never reach the DB.
2. **Renderer** (`components/student/QuestionCard.tsx`): `isMetaPromptPassage()` defensively detects bad rows already in the DB, hides the broken passage card, and renders the meta-prompt as the question stem with an amber "missing passage" notice.
3. **Migration** (`supabase/migrations/003_purge_meta_prompt_questions.sql`, historical): one-shot cleanup of bad rows already inserted. A future cleanup would be a new D1 migration.

Patterns matched: `the author of (this|the) passage`, `the (writer|author|speaker) (wants|aims|intends|seeks)`, `this passage (is about|describes|discusses|argues|explains)`, `what is the most likely reason`, `which choice best`, and any `passage_text` ending in `?`. If new variants leak through, add them to all three locations.

## Conventions

- **HTML in passages**: `<u>` marks "underlined portions" referenced by questions (Standard English Conventions, Text Structure & Purpose). CB also wraps prose paragraphs in `<p>`. The shared sanitizer in `lib/sanitize.ts` is the single source of truth for the allowlist — every component that renders question HTML should import `sanitizeHtml` from there, never define its own.
- **Data access goes through `lib/db`.** `createClient()` / `createAdminClient()` return the same D1 client with the supabase-js call shape (`.from().select().eq()...`, `{ data, error }`), so the code reads as it did on Supabase. It implements only the subset in use — see the header of `lib/db/query.ts`; write plain SQL with `d1()` rather than growing it.
- **There is no RLS.** Every route resolves the caller with `auth.getUser()` and must filter by their id / family itself. Never trust a user or student id from the request body without checking family membership (see `/api/students/reset` for the pattern).
- **SQLite types**: JSON columns are TEXT and booleans are 0/1 — `lib/db/schema.ts` lists them so reads come back as objects/booleans. Add new JSON/boolean columns there. Timestamps are ISO strings from `toISOString()` (string comparison == time comparison); `content_hash` is computed in code, not by the database.
- **Migrations are numbered** (`0001_`, `0002_`, ...) in `migrations/`. Create new ones; never edit applied ones. Apply each new one to the remote as part of the task that writes it: `npx wrangler d1 migrations apply DB --remote`. Don't hand the SQL back to the user to run.
- **The route at `/api/questions/next` must not duplicate selection logic** — it delegates to `selectNextQuestion()` and only handles Gemini fallback. If you need to change selection priority, change the selector, not the route.

## Scripts

- `npm run dev` — Next.js dev server (bindings come from `wrangler.jsonc`, local D1/R2; secrets in `.dev.vars`)
- `npm run build` — Next.js build (also run by the deploy)
- `npm run preview` — build and run the real Worker locally
- `npm run deploy` — build and deploy to Cloudflare. Nothing auto-deploys from git. **Deploying is part of every code task**: once a change is verified, apply any new migration remotely (`CI=1 npx wrangler d1 migrations apply DB --remote` — without `CI=1` it waits on a prompt), run `npm run deploy`, and smoke-test https://satgamer.pmansour.com. Don't hand this step to the user.
- `npm run lint`

## Things to watch out for

- The `app/api/questions/generate` route writes shared content — it must remain auth-gated (currently checks `supabase.auth.getUser()`).
- **Push notifications** are hand-rolled on WebCrypto in `lib/push.ts` (VAPID + aes128gcm). The `web-push` package doesn't run on Workers; don't reintroduce it.
- `ON DELETE CASCADE` is set on `student_questions.question_id`, so deleting from `questions` cleans up dependent rows automatically.
- DSAT categories are a closed set in `lib/constants.ts` — don't introduce new ones without updating prompts, the selector, and any UI that lists categories.
- `/api/sessions/start` now reads a `{ mode }` body. The practice page posts no body at all, so the body parse must stay fault-tolerant (`.catch(() => ({}))`) or passage practice breaks.
- Adding a word to `lib/vocab/word-list.ts` requires a `sense` tag if it shares a meaning with anything already on the list. See the Vocabulary section above.
