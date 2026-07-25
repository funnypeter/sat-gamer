-- The July 8 College Board re-import (and earlier overlapping imports)
-- inserted the same questions again under new UUIDs. The selector tracks
-- "seen" by question id, so students were re-served content they had
-- already answered. This migration:
--   1. adds a stored content hash to questions,
--   2. repoints answer history and spaced repetition at one canonical
--      row per unique content,
--   3. deletes the duplicate rows,
--   4. enforces uniqueness so future imports/generation can't reintroduce
--      duplicates (insert sites use upsert ... ignoreDuplicates).

alter table public.questions
  add column if not exists content_hash text
  generated always as (md5(coalesce(passage_text, '') || '|' || question_text)) stored;

-- Canonical row per content: the one with the most recorded answers
-- (so we move as few history rows as possible), oldest first on ties.
create temp table canon as
select distinct on (q.content_hash) q.content_hash, q.id as canonical_id
from public.questions q
left join lateral (
  select count(*) as n from public.student_questions sq where sq.question_id = q.id
) answers on true
order by q.content_hash, answers.n desc, q.created_at asc, q.id;

create temp table dupmap as
select q.id as dup_id, c.canonical_id
from public.questions q
join canon c on c.content_hash = q.content_hash
where q.id <> c.canonical_id;

-- Answer history: repoint freely (no unique constraint on question_id).
update public.student_questions sq
set question_id = m.canonical_id
from dupmap m
where sq.question_id = m.dup_id;

-- Spaced repetition has unique (student_id, question_id): first collapse
-- to one row per student per content (earliest due date wins), then repoint.
with ranked as (
  select sr.id,
    row_number() over (
      partition by sr.student_id, q.content_hash
      order by sr.next_review_date asc, sr.id
    ) as rn
  from public.spaced_repetition sr
  join public.questions q on q.id = sr.question_id
)
delete from public.spaced_repetition
where id in (select id from ranked where rn > 1);

update public.spaced_repetition sr
set question_id = m.canonical_id
from dupmap m
where sr.question_id = m.dup_id;

delete from public.questions q
using dupmap m
where q.id = m.dup_id;

create unique index if not exists questions_content_hash_key
  on public.questions (content_hash);

drop table canon;
drop table dupmap;
