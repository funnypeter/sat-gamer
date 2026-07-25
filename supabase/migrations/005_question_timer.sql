-- Per-question stopwatch: student-facing toggle stored on the user row,
-- and an aggregate for the parent detail page (average answer time per
-- category). The RPC avoids pulling every student_questions row through
-- PostgREST's 1000-row page cap just to average one column.

alter table public.users
  add column if not exists show_question_timer boolean not null default true;

create or replace function public.avg_time_by_category(p_student_id uuid)
returns table (category text, avg_seconds numeric, attempts bigint)
language sql
stable
as $$
  select q.category,
         round(avg(sq.time_spent_seconds)::numeric, 1) as avg_seconds,
         count(*) as attempts
  from public.student_questions sq
  join public.questions q on q.id = sq.question_id
  where sq.student_id = p_student_id
    and sq.time_spent_seconds > 0
  group by q.category;
$$;
