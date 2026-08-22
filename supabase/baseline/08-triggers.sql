-- ─── Triggers ─────────────────────────────────────────────────────────────
--
-- The fifth thing the empty branch found. Part 04 creates both trigger
-- functions and the baseline created neither trigger, so a rebuilt database
-- held the code and never ran it.
--
-- That failure is quiet in the way that matters: nothing errors. Reply counts
-- simply stay at zero while replies accumulate, and a phase that is supposed
-- to be a contract can be edited in place — the rule 04 writes three
-- paragraphs about, not enforced. A QA environment would have agreed with
-- every test and disagreed with production.
--
-- Introspected from production 17 Aug 2026. Last, because a trigger needs both
-- its table and its function.

DROP TRIGGER IF EXISTS trg_reply_count ON public.community_messages;
CREATE TRIGGER trg_reply_count
  AFTER INSERT OR DELETE ON public.community_messages
  FOR EACH ROW EXECUTE FUNCTION bump_reply_count();

DROP TRIGGER IF EXISTS tracked_habit_phases_freeze ON public.tracked_habit_phases;
CREATE TRIGGER tracked_habit_phases_freeze
  BEFORE UPDATE ON public.tracked_habit_phases
  FOR EACH ROW EXECUTE FUNCTION tracked_habit_phase_freeze();
