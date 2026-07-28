# SAT Gamer

Digital SAT (DSAT) Reading & Writing prep app. Students earn gaming time by answering questions; parents oversee progress.

Two practice modes: **passage questions** (`/practice`) and **vocabulary drilling** (`/vocab`). They share the session, earning, and streak machinery but have separate content pipelines, separate progress tracking, and separate reporting.

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
  supabase/       server.ts (RLS), admin.ts (service role), browser client
  collegeboard/   College Board question importer
  constants.ts    DSAT_CATEGORIES, DIFFICULTY_BANDS, VOCAB_EARNING_RATES, VOCAB_MASTERY
  types/          database types
stores/           Zustand stores (session-store, vocab-store)
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
3. **Migration** (`supabase/migrations/003_purge_meta_prompt_questions.sql`): one-shot cleanup of bad rows already inserted.

Patterns matched: `the author of (this|the) passage`, `the (writer|author|speaker) (wants|aims|intends|seeks)`, `this passage (is about|describes|discusses|argues|explains)`, `what is the most likely reason`, `which choice best`, and any `passage_text` ending in `?`. If new variants leak through, add them to all three locations.

## Conventions

- **HTML in passages**: `<u>` marks "underlined portions" referenced by questions (Standard English Conventions, Text Structure & Purpose). CB also wraps prose paragraphs in `<p>`. The shared sanitizer in `lib/sanitize.ts` is the single source of truth for the allowlist — every component that renders question HTML should import `sanitizeHtml` from there, never define its own.
- **Two Supabase clients**: `lib/supabase/server.ts` for user-scoped (RLS-enforced) reads; `lib/supabase/admin.ts` for service-role inserts (used by `/api/questions/generate`, import-cb, and seed routes). Never use the admin client in user-facing reads.
- **Migrations are numbered** (`001_`, `002_`, ...). Create new ones; never edit applied ones.
- **Supabase migrations don't auto-deploy with Vercel.** Apply each new migration to the project (`pwyzlwpxevdnxktddfwl`) as part of the same task that writes it — via the Supabase MCP tools, `supabase db push`, or the dashboard. Don't hand the SQL back to the user to run. Numbered files in `supabase/migrations/` stay the source of truth; the remote's applied list (`list_migrations`) only goes back to `004` because `001`-`003` predate migration tracking.
- **The route at `/api/questions/next` must not duplicate selection logic** — it delegates to `selectNextQuestion()` and only handles Gemini fallback. If you need to change selection priority, change the selector, not the route.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build (Vercel runs this)
- `npm run lint`

## Things to watch out for

- The `app/api/questions/generate` route uses the **admin client** — it must remain auth-gated (currently checks `supabase.auth.getUser()`).
- `ON DELETE CASCADE` is set on `student_questions.question_id`, so deleting from `questions` cleans up dependent rows automatically.
- DSAT categories are a closed set in `lib/constants.ts` — don't introduce new ones without updating prompts, the selector, and any UI that lists categories.
- `/api/sessions/start` now reads a `{ mode }` body. The practice page posts no body at all, so the body parse must stay fault-tolerant (`.catch(() => ({}))`) or passage practice breaks.
- Adding a word to `lib/vocab/word-list.ts` requires a `sense` tag if it shares a meaning with anything already on the list. See the Vocabulary section above.
