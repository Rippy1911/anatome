-- Planned workouts.
--
-- The log could only answer "what did I do". People also want "what am I doing on Thursday" —
-- and a plan is the same shape as a session that has not happened yet, so it is a status on the
-- same row rather than a second table with its own half of the query surface.
--
-- THE TRAP THIS EXISTS TO AVOID: a planned session must never count toward training volume,
-- 1RM estimates, or a daily summary. If it did, planning next week would silently inflate this
-- week's numbers, and the person would not find out until the graph looked wrong. So `status`
-- is denormalised onto workout_sets exactly like `date` was — every aggregate reads it directly
-- and filters, with no join to remember.
--
-- Both copies move together in one batch when a plan is marked done (see markWorkoutDone). That
-- is the only write that changes status, which is what keeps the denormalisation honest.

ALTER TABLE workouts ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE workout_sets ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';

-- "What am I doing this week" and "what did I actually do" are both a status+date range scan.
CREATE INDEX IF NOT EXISTS workouts_user_status_date ON workouts (user_id, status, date);
-- Volume and history queries always filter status, so it belongs in front of the sort column.
CREATE INDEX IF NOT EXISTS sets_user_status_exercise_date
    ON workout_sets (user_id, status, exercise_key, date DESC);

-- ---------------------------------------------------------------------------
-- Repair: heal rows written during a deploy rollout
-- ---------------------------------------------------------------------------
--
-- Observed in production, not theorised. During the rollout of migration 0002's code, two
-- writes seconds apart landed on different Worker versions: one stored `exercise_key` and
-- `date`, the other (still on the old build) stored NULLs — and a NULL `exercise_key` is
-- invisible to every search, permanently. 0002's backfill had already run, so nothing would
-- ever have fixed it.
--
-- Any migration that adds a denormalised column has this window. Re-running the backfill here
-- closes it for 0002, and this block is the pattern to copy next time. It is idempotent and
-- touches only rows that are already broken.
UPDATE workout_sets
   SET exercise_key = lower(trim(exercise_name))
 WHERE exercise_key IS NULL OR exercise_key = '';

UPDATE workout_sets
   SET date = (SELECT w.date FROM workouts w WHERE w.id = workout_sets.workout_id)
 WHERE date IS NULL OR date = '';
