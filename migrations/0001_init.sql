-- ============================================================
-- SAT Gamer — D1 (SQLite) schema
-- ============================================================
--
-- Port of supabase/migrations/001-008 as they stood when the app left
-- Supabase (Oct 2026). Postgres → SQLite translations, applied everywhere:
--
--   uuid          → TEXT, generated in code (lib/db/query.ts) when omitted
--   jsonb         → TEXT holding JSON; lib/db/schema.ts lists the JSON
--                   columns so the query layer parses/serializes them
--   boolean       → INTEGER 0/1; also listed in lib/db/schema.ts
--   timestamptz   → TEXT, ISO-8601 UTC with milliseconds ("…T12:00:00.000Z"),
--                   the same shape as Date#toISOString() so string
--                   comparison == time comparison
--   date          → TEXT "YYYY-MM-DD"
--   content_hash  → was a Postgres generated column (md5); SQLite has no md5,
--                   so the query layer fills it on insert with the same
--                   formula, keeping hashes of migrated rows valid
--
-- RLS is gone: every route already resolves the caller from the session and
-- filters by their id/family. Auth lives in auth_users / auth_sessions.

CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  -- "$2a$…" bcrypt (migrated from Supabase) or "pbkdf2$…" (new / re-hashed on login)
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  invite_code TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('student', 'parent')),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  show_question_timer INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_users_family ON users(family_id);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  passage_text TEXT NOT NULL,
  question_text TEXT NOT NULL,
  choices TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanations TEXT NOT NULL,
  difficulty_rating INTEGER NOT NULL CHECK (difficulty_rating BETWEEN 200 AND 900),
  generated_by TEXT NOT NULL DEFAULT 'gemini',
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_questions_category ON questions(category);
CREATE INDEX idx_questions_difficulty ON questions(difficulty_rating);
CREATE INDEX idx_questions_category_difficulty ON questions(category, difficulty_rating);
CREATE UNIQUE INDEX questions_content_hash_key ON questions(content_hash);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  accuracy REAL,
  minutes_earned REAL NOT NULL DEFAULT 0,
  block_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  mode TEXT NOT NULL DEFAULT 'practice' CHECK (mode IN ('practice', 'vocab'))
);
CREATE INDEX idx_sessions_student ON sessions(student_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_student_started ON sessions(student_id, started_at DESC);
CREATE INDEX idx_sessions_student_mode ON sessions(student_id, mode, started_at DESC);

CREATE TABLE student_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_given TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sq_student ON student_questions(student_id);
CREATE INDEX idx_sq_session ON student_questions(session_id);
CREATE INDEX idx_sq_question ON student_questions(question_id);

CREATE TABLE student_stats (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  elo_rating INTEGER NOT NULL DEFAULT 500,
  total_attempted INTEGER NOT NULL DEFAULT 0,
  total_correct INTEGER NOT NULL DEFAULT 0,
  last_practiced TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, category)
);
CREATE INDEX idx_stats_student ON student_stats(student_id);

CREATE TABLE time_balances (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  minutes_earned REAL NOT NULL,
  minutes_remaining REAL NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  redeemed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_balances_student ON time_balances(student_id);
CREATE INDEX idx_balances_expires ON time_balances(expires_at);

CREATE TABLE redemption_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_minutes REAL NOT NULL,
  activity_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  parent_id TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_redemption_student ON redemption_requests(student_id);
CREATE INDEX idx_redemption_status ON redemption_requests(status);

CREATE TABLE streaks (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_practice_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE spaced_repetition (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  next_review_date TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, question_id)
);
CREATE INDEX idx_sr_review_date ON spaced_repetition(student_id, next_review_date);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);

-- Single row holding the VAPID keypair (see lib/push.ts).
CREATE TABLE push_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vapid_public_key TEXT NOT NULL,
  vapid_private_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE vocab_items (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  sentence TEXT NOT NULL,
  choices TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  explanations TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
  variant_index INTEGER NOT NULL DEFAULT 0,
  generated_by TEXT NOT NULL DEFAULT 'gemini',
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX vocab_items_content_hash_key ON vocab_items(content_hash);
CREATE INDEX idx_vocab_items_word ON vocab_items(word);
CREATE INDEX idx_vocab_items_tier ON vocab_items(tier);

CREATE TABLE vocab_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES vocab_items(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  answer_given TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_vocab_attempts_student ON vocab_attempts(student_id);
CREATE INDEX idx_vocab_attempts_session ON vocab_attempts(session_id);
CREATE INDEX idx_vocab_attempts_item ON vocab_attempts(item_id);
CREATE INDEX idx_vocab_attempts_student_word ON vocab_attempts(student_id, word);

CREATE TABLE vocab_mastery (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  times_seen INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  mastered INTEGER NOT NULL DEFAULT 0,
  next_review_date TEXT,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  last_seen_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, word)
);
CREATE INDEX idx_vocab_mastery_due ON vocab_mastery(student_id, next_review_date);
