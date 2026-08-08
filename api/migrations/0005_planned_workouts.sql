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
