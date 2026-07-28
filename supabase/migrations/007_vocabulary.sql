-- ============================================================
-- SAT Gamer — Vocabulary practice
-- ============================================================
--
-- Adds a second drill mode alongside passage questions: sentence-completion
-- vocabulary over a fixed curated word list (lib/vocab/word-list.ts).
--
-- Three design notes worth carrying forward:
--
-- 1. Vocabulary reuses `sessions` rather than getting its own session table.
--    `time_balances.session_id` is a NOT NULL FK onto `sessions`, so awarding
--    gaming time for a vocab rep requires a real sessions row. The new `mode`
--    column is what keeps the two apart in reporting — practice accuracy and
--    vocab accuracy measure different things and must not be averaged
--    together.
--
-- 2. The word list itself is NOT a table. It ships in the repo as TypeScript
--    so mastery has a stable denominator and the list is reviewable in
--    version control. Only the *generated sentences* live in Postgres.
--
-- 3. Vocabulary deliberately does not touch `student_stats` / Elo. Question
--    selection reads that Elo to pick College Board questions in the right
--    band; feeding single-word items into it would move the rating on a
--    different skill and mis-target passage practice. Vocabulary progress is
--    tracked entirely in `vocab_mastery`.

-- ─── sessions.mode ──────────────────────────────────────────
alter table public.sessions
  add column if not exists mode text not null default 'practice'
  check (mode in ('practice', 'vocab'));

create index if not exists idx_sessions_student_mode
  on public.sessions(student_id, mode, started_at desc);

-- ─── vocab_items ────────────────────────────────────────────
-- One generated sentence-completion item. Many items per word (variants), so
-- a word can be re-drilled in fresh context instead of from memory of the
-- sentence.
create table if not exists public.vocab_items (
  id uuid primary key default uuid_generate_v4(),
  word text not null,
  sentence text not null,              -- contains exactly one ______
  choices jsonb not null,              -- [{label, text}, ...] text = a word
  correct_answer text not null check (correct_answer in ('A','B','C','D')),
  explanations jsonb not null,         -- {A: "...", B: "...", ...}
  tier integer not null check (tier between 1 and 3),
  variant_index integer not null default 0,
  generated_by text not null default 'gemini',
  created_at timestamptz not null default now(),
  -- Same dedupe strategy as questions (migration 004): a stored hash plus a
  -- unique index, so a retried or overlapping generation batch upserts
  -- instead of quietly creating a near-duplicate the selector would serve
  -- twice.
  content_hash text generated always as (md5(word || '|' || sentence)) stored
);

alter table public.vocab_items enable row level security;

-- Policies are dropped first so the whole file is safely re-runnable —
-- `create policy` has no `if not exists` form and errors on a second run.
drop policy if exists "Authenticated users can read vocab items" on public.vocab_items;
create policy "Authenticated users can read vocab items"
  on public.vocab_items for select
  using (auth.role() = 'authenticated');
-- Inserts are service-role only (admin client), matching public.questions.

create unique index if not exists vocab_items_content_hash_key
  on public.vocab_items (content_hash);
create index if not exists idx_vocab_items_word on public.vocab_items(word);
create index if not exists idx_vocab_items_tier on public.vocab_items(tier);

-- ─── vocab_attempts ─────────────────────────────────────────
-- Answer history. `word` is denormalized so the Review/stats queries don't
-- have to join vocab_items just to group by word.
create table if not exists public.vocab_attempts (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.vocab_items(id) on delete cascade,
  word text not null,
  answer_given text not null,
  is_correct boolean not null,
  time_spent_seconds integer not null default 0,
  answered_at timestamptz not null default now()
);

alter table public.vocab_attempts enable row level security;

drop policy if exists "Students can view own vocab attempts" on public.vocab_attempts;
create policy "Students can view own vocab attempts"
  on public.vocab_attempts for select
  using (student_id = auth.uid());

drop policy if exists "Students can insert own vocab attempts" on public.vocab_attempts;
create policy "Students can insert own vocab attempts"
  on public.vocab_attempts for insert
  with check (student_id = auth.uid());

drop policy if exists "Parents can view family vocab attempts" on public.vocab_attempts;
create policy "Parents can view family vocab attempts"
  on public.vocab_attempts for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index if not exists idx_vocab_attempts_student on public.vocab_attempts(student_id);
create index if not exists idx_vocab_attempts_session on public.vocab_attempts(session_id);
create index if not exists idx_vocab_attempts_item on public.vocab_attempts(item_id);
create index if not exists idx_vocab_attempts_student_word on public.vocab_attempts(student_id, word);

-- ─── vocab_mastery ──────────────────────────────────────────
-- One row per student per word they've met. Doubles as the spaced-repetition
-- schedule — unlike passage questions, which keep SR in a separate table,
-- vocabulary schedules by *word* rather than by item, because the point is to
-- learn the word, not one particular sentence about it.
create table if not exists public.vocab_mastery (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade,
  word text not null,
  times_seen integer not null default 0,
  times_correct integer not null default 0,
  consecutive_correct integer not null default 0,
  mastered boolean not null default false,
  next_review_date date,
  interval_days integer not null default 1,
  ease_factor numeric(3,2) not null default 2.50,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(student_id, word)
);

alter table public.vocab_mastery enable row level security;

drop policy if exists "Students can view own vocab mastery" on public.vocab_mastery;
create policy "Students can view own vocab mastery"
  on public.vocab_mastery for select
  using (student_id = auth.uid());

drop policy if exists "Students can insert own vocab mastery" on public.vocab_mastery;
create policy "Students can insert own vocab mastery"
  on public.vocab_mastery for insert
  with check (student_id = auth.uid());

drop policy if exists "Students can update own vocab mastery" on public.vocab_mastery;
create policy "Students can update own vocab mastery"
  on public.vocab_mastery for update
  using (student_id = auth.uid());

drop policy if exists "Parents can view family vocab mastery" on public.vocab_mastery;
create policy "Parents can view family vocab mastery"
  on public.vocab_mastery for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index if not exists idx_vocab_mastery_student on public.vocab_mastery(student_id);
create index if not exists idx_vocab_mastery_due
  on public.vocab_mastery(student_id, next_review_date)
  where mastered = false;
