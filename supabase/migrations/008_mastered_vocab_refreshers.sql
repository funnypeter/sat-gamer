-- Mastered vocabulary words used to be retired outright: nextMastery() set
-- next_review_date = null once a word hit three consecutive correct answers,
-- and the selector only surfaced mastered words after the entire word list had
-- been exhausted — which in practice meant never. A word proved three times
-- inside a fortnight and then never shown again is a word the student can
-- forget without the app noticing.
--
-- Learned words now stay on a long refresher schedule (21 / 45 / 90 days, see
-- VOCAB_MASTERY.masteredReviewIntervalDays). This backfills the rows that were
-- mastered under the old rule so they rejoin the rotation instead of sitting
-- permanently unscheduled.
--
-- The due dates are spread randomly across the next three weeks rather than
-- all landing on day 21: a cohort of words mastered in the same week would
-- otherwise all come due in the same session.
update public.vocab_mastery
set next_review_date = (current_date + (floor(random() * 21))::int)::date,
    interval_days = 21,
    updated_at = now()
where mastered = true
  and next_review_date is null;
