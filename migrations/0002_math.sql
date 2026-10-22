-- ============================================================
-- SAT Gamer — Math practice
-- ============================================================
--
-- Math runs on the same question pipeline as Reading & Writing ("verbal"):
-- same questions table, selector, Elo, spaced repetition, earning and weekly
-- cap. Three columns tell them apart:
--
--   questions.subject         'verbal' | 'math' — which track serves it.
--   questions.answer_format   'mcq' (A-D, as before) | 'spr' — College
--                             Board's "student-produced response" grid-ins,
--                             where the student types the answer.
--   questions.accepted_answers  spr only: JSON array of every accepted form
--                             (e.g. ["3/2","1.5"]); graded by lib/math-answer.ts.
--                             correct_answer holds the first one, for display.
--
--   sessions.subject          which track the session drilled. Kept apart
--                             from sessions.mode ('practice' | 'vocab'):
--                             math is passage-style practice, and widening
--                             the mode CHECK would mean rebuilding the table.
--
-- Math categories are the four SAT Math domains (lib/constants.ts
-- MATH_CATEGORIES); student_stats rows for them are created on first answer.

ALTER TABLE questions ADD COLUMN subject TEXT NOT NULL DEFAULT 'verbal'
  CHECK (subject IN ('verbal', 'math'));
ALTER TABLE questions ADD COLUMN answer_format TEXT NOT NULL DEFAULT 'mcq'
  CHECK (answer_format IN ('mcq', 'spr'));
ALTER TABLE questions ADD COLUMN accepted_answers TEXT;

CREATE INDEX idx_questions_subject_difficulty ON questions(subject, difficulty_rating);

ALTER TABLE sessions ADD COLUMN subject TEXT NOT NULL DEFAULT 'verbal'
  CHECK (subject IN ('verbal', 'math'));
