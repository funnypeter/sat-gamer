-- ============================================================
-- SAT Gamer — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── families ───────────────────────────────────────────────
create table public.families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  settings jsonb not null default '{
    "accuracyTiers": [
      {"min": 90, "minutes": 15},
      {"min": 80, "minutes": 12},
      {"min": 70, "minutes": 10},
      {"min": 60, "minutes": 7},
      {"min": 0, "minutes": 5}
    ],
    "decayDays": 7,
    "dailyCapMinutes": 60,
    "weekendBaseMinutes": 30,
    "blockMinutes": 15
  }'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;

create policy "Users can view own family"
  on public.families for select
  using (id in (select family_id from public.users where id = auth.uid()));

create policy "Parents can update own family"
  on public.families for update
  using (id in (select family_id from public.users where id = auth.uid() and role = 'parent'));

-- ─── users ──────────────────────────────────────────────────
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  role text not null check (role in ('student', 'parent')),
  display_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own profile"
  on public.users for select
  using (id = auth.uid());

create policy "Parents can view family members"
  on public.users for select
  using (family_id in (select family_id from public.users where id = auth.uid() and role = 'parent'));

create policy "Users can update own profile"
  on public.users for update
  using (id = auth.uid());

create policy "Parents can insert family members"
  on public.users for insert
  with check (family_id in (select family_id from public.users where id = auth.uid() and role = 'parent'));

create index idx_users_family on public.users(family_id);
create index idx_users_role on public.users(role);

-- ─── questions ──────────────────────────────────────────────
create table public.questions (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  passage_text text not null,
  question_text text not null,
  choices jsonb not null, -- [{label, text}, ...]
  correct_answer text not null,
  explanations jsonb not null, -- {A: "...", B: "...", ...}
  difficulty_rating integer not null check (difficulty_rating between 200 and 900),
  generated_by text not null default 'gemini',
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

-- All authenticated users can read questions
create policy "Authenticated users can read questions"
  on public.questions for select
  using (auth.role() = 'authenticated');

-- Only service role can insert (handled by admin client bypassing RLS)
-- No insert policy for regular users

create index idx_questions_category on public.questions(category);
create index idx_questions_difficulty on public.questions(difficulty_rating);
create index idx_questions_category_difficulty on public.questions(category, difficulty_rating);

-- ─── sessions ───────────────────────────────────────────────
create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  accuracy numeric(5,2),
  minutes_earned numeric(5,2) not null default 0,
  block_seconds integer not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned'))
);

alter table public.sessions enable row level security;

create policy "Students can view own sessions"
  on public.sessions for select
  using (student_id = auth.uid());

create policy "Students can insert own sessions"
  on public.sessions for insert
  with check (student_id = auth.uid());

create policy "Students can update own sessions"
  on public.sessions for update
  using (student_id = auth.uid());

create policy "Parents can view family sessions"
  on public.sessions for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index idx_sessions_student on public.sessions(student_id);
create index idx_sessions_status on public.sessions(status);
create index idx_sessions_student_started on public.sessions(student_id, started_at desc);

-- ─── student_questions ──────────────────────────────────────
create table public.student_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_given text not null,
  is_correct boolean not null,
  time_spent_seconds integer not null default 0,
  elo_before integer not null,
  elo_after integer not null,
  answered_at timestamptz not null default now()
);

alter table public.student_questions enable row level security;

create policy "Students can view own answers"
  on public.student_questions for select
  using (student_id = auth.uid());

create policy "Students can insert own answers"
  on public.student_questions for insert
  with check (student_id = auth.uid());

create policy "Parents can view family answers"
  on public.student_questions for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index idx_sq_student on public.student_questions(student_id);
create index idx_sq_session on public.student_questions(session_id);
create index idx_sq_question on public.student_questions(question_id);

-- ─── student_stats ──────────────────────────────────────────
create table public.student_stats (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  elo_rating integer not null default 500,
  total_attempted integer not null default 0,
  total_correct integer not null default 0,
  last_practiced timestamptz,
  updated_at timestamptz not null default now(),
  unique(student_id, category)
);

alter table public.student_stats enable row level security;

create policy "Students can view own stats"
  on public.student_stats for select
  using (student_id = auth.uid());

create policy "Students can insert own stats"
  on public.student_stats for insert
  with check (student_id = auth.uid());

create policy "Students can update own stats"
  on public.student_stats for update
  using (student_id = auth.uid());

create policy "Parents can view family stats"
  on public.student_stats for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index idx_stats_student on public.student_stats(student_id);
create index idx_stats_student_category on public.student_stats(student_id, category);

-- ─── time_balances ──────────────────────────────────────────
create table public.time_balances (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  minutes_earned numeric(5,2) not null,
  minutes_remaining numeric(5,2) not null,
  earned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed boolean not null default false
);

alter table public.time_balances enable row level security;

create policy "Students can view own balances"
  on public.time_balances for select
  using (student_id = auth.uid());

create policy "Students can insert own balances"
  on public.time_balances for insert
  with check (student_id = auth.uid());

create policy "Students can update own balances"
  on public.time_balances for update
  using (student_id = auth.uid());

create policy "Parents can view family balances"
  on public.time_balances for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create policy "Parents can update family balances"
  on public.time_balances for update
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index idx_balances_student on public.time_balances(student_id);
create index idx_balances_expires on public.time_balances(expires_at);

-- ─── redemption_requests ────────────────────────────────────
create table public.redemption_requests (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade,
  requested_minutes numeric(5,2) not null,
  activity_description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  parent_id uuid references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.redemption_requests enable row level security;

create policy "Students can view own requests"
  on public.redemption_requests for select
  using (student_id = auth.uid());

create policy "Students can insert own requests"
  on public.redemption_requests for insert
  with check (student_id = auth.uid());

create policy "Parents can view family requests"
  on public.redemption_requests for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create policy "Parents can update family requests"
  on public.redemption_requests for update
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index idx_redemption_student on public.redemption_requests(student_id);
create index idx_redemption_status on public.redemption_requests(status);

-- ─── streaks ────────────────────────────────────────────────
create table public.streaks (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade unique,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_practice_date date,
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

create policy "Students can view own streak"
  on public.streaks for select
  using (student_id = auth.uid());

create policy "Students can insert own streak"
  on public.streaks for insert
  with check (student_id = auth.uid());

create policy "Students can update own streak"
  on public.streaks for update
  using (student_id = auth.uid());

create policy "Parents can view family streaks"
  on public.streaks for select
  using (student_id in (
    select u.id from public.users u
    where u.family_id in (select family_id from public.users where id = auth.uid() and role = 'parent')
    and u.role = 'student'
  ));

create index idx_streaks_student on public.streaks(student_id);

-- ─── spaced_repetition ─────────────────────────────────────
create table public.spaced_repetition (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  next_review_date date not null,
  interval_days integer not null default 1,
  ease_factor numeric(3,2) not null default 2.50,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(student_id, question_id)
);

alter table public.spaced_repetition enable row level security;

create policy "Students can view own repetitions"
  on public.spaced_repetition for select
  using (student_id = auth.uid());

create policy "Students can insert own repetitions"
  on public.spaced_repetition for insert
  with check (student_id = auth.uid());

create policy "Students can update own repetitions"
  on public.spaced_repetition for update
  using (student_id = auth.uid());

create index idx_sr_student on public.spaced_repetition(student_id);
create index idx_sr_review_date on public.spaced_repetition(student_id, next_review_date);

-- ─── notifications ──────────────────────────────────────────
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  data jsonb,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "Users can insert notifications"
  on public.notifications for insert
  with check (true); -- allows system to create notifications for any user

create index idx_notifications_user on public.notifications(user_id);
create index idx_notifications_unread on public.notifications(user_id, read) where read = false;
