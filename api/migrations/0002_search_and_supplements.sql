-- Make the log searchable, and add supplements.
--
-- The v1 schema could answer "what did I do" but not "how has my bench gone since March", which
-- is the question a coach or a returning user actually asks. Three changes make that a single
-- indexed range scan instead of a join plus a scan:
--
--   1. workout_sets.date        — denormalised from its workout. Exercise history is by date, and
--                                 without this every such query joins back to workouts first.
--   2. workout_sets.exercise_key — lower-cased name. "Bench Press", "bench press" and "BENCH
--                                 press" are one exercise to a human and were three to the index.
--                                 The original spelling stays in exercise_name for display.
--   3. supplements              — the one thing people log daily that had nowhere to go.
--
-- The denormalised date is written by the app on insert (workouts are immutable once logged:
-- there is no "move a workout to another day" operation, so it cannot drift). If an edit path is
-- ever added, it must update both — noted here because that is where this design breaks.

-- ---------------------------------------------------------------------------
-- 1 + 2: make workout_sets answerable on its own
-- ---------------------------------------------------------------------------

ALTER TABLE workout_sets ADD COLUMN date TEXT;
ALTER TABLE workout_sets ADD COLUMN exercise_key TEXT;

UPDATE workout_sets
   SET date = (SELECT w.date FROM workouts w WHERE w.id = workout_sets.workout_id)
 WHERE date IS NULL;

UPDATE workout_sets
   SET exercise_key = lower(trim(exercise_name))
 WHERE exercise_key IS NULL;

-- The index the whole feature rests on: one user's history of one exercise, newest first.
CREATE INDEX IF NOT EXISTS sets_user_exercise_date
    ON workout_sets (user_id, exercise_key, date DESC);

-- "What did I train on this date" without touching workouts.
CREATE INDEX IF NOT EXISTS sets_user_date
    ON workout_sets (user_id, date DESC);

-- Superseded by sets_user_exercise_date, which has the same prefix plus a useful sort column.
DROP INDEX IF EXISTS sets_user_exercise;

-- ---------------------------------------------------------------------------
-- 3: supplements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS supplements (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,              -- YYYY-MM-DD in the user's timezone, like every other date here
  name       TEXT NOT NULL,              -- as the user says it: "creatine", "vitamin D3"
  name_key   TEXT NOT NULL,              -- lower-cased, for "how often do I actually take creatine"
  dose       REAL,                       -- optional: plenty of people log "took my magnesium"
  unit       TEXT NOT NULL DEFAULT '',   -- g | mg | mcg | iu | ml | capsule | scoop
  notes      TEXT NOT NULL DEFAULT '',
  logged_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS supplements_user_date ON supplements (user_id, date DESC);
CREATE INDEX IF NOT EXISTS supplements_user_name ON supplements (user_id, name_key, date DESC);

-- ---------------------------------------------------------------------------
-- Meals: support name search bounded by a date range
-- ---------------------------------------------------------------------------

-- LIKE '%x%' cannot use an index, so search is a scan — but always inside one user's rows and
-- normally inside a date range, which for a personal food log is a few hundred rows at most.
-- ponytail: FTS5 is the upgrade path if anyone's log ever gets big enough to notice. Adding it
-- now would be a virtual table, triggers and a rebuild for a query that currently runs in
-- microseconds.
CREATE INDEX IF NOT EXISTS meals_user_logged ON meals (user_id, logged_at DESC);
