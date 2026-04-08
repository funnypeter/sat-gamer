-- Purge questions where Gemini filled passage_text with a meta-description
-- of the passage (e.g. "The author of this passage wants to...") instead of
-- the actual passage prose. These render as unanswerable questions in the UI
-- because the real passage is missing.
--
-- The same patterns are now enforced at generation time in
-- lib/gemini/schema.ts, so no new rows of this shape should appear.
--
-- ON DELETE CASCADE on student_questions.question_id and elsewhere will
-- clean up dependent rows automatically.

delete from public.questions
where
  passage_text ~* '\mthe author of (this|the) passage\M'
  or passage_text ~* '\mthe (writer|author|speaker) (wants|aims|intends|seeks)\M'
  or passage_text ~* '\mthis passage (is about|describes|discusses|argues|explains)\M'
  or passage_text ~* '\mwhat is the most likely reason\M'
  or passage_text ~* '\mwhich choice best\M'
  or btrim(passage_text) ~ '\?$';
