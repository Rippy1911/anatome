-- Anatome accounts + personal logging.
--
-- Everything a signed-in user owns lives here. The catalog (exercises, muscles, guides) is
-- bundled with the Worker and never touches this database, so a deployment with no D1 binding
-- still serves the entire public API — it just has no logging tools. See db.ts `hasDb`.
--
-- FIELD NAMING IS DELIBERATE. Column names mirror ns-infra/services/anatome-platform/schema.sql
-- (calories/protein/carbs/fats, weight, reps, amount_ml, date) so a user who outgrows this tier
-- migrates to the hosted platform by copying rows, not by remapping a schema. Do not "improve"
-- a name here without changing it there too.
--
-- DATES ARE LOCAL. `date` columns hold a YYYY-MM-DD string already resolved in the user's own
-- timezone, not UTC. A meal eaten at 23:30 in Warsaw belongs to that day, not to tomorrow. See
-- tz.ts; the platform has this exact bug today (its timezone column is dead code) and it makes
-- every streak and daily total wrong for anyone outside UTC.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  -- Lower-cased email, the actual uniqueness key. Stored separately so the original casing
  -- survives for display while `Foo@x.com` and `foo@x.com` cannot both register.
  email_lower    TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,   -- PBKDF2-SHA256, base64
  password_salt  TEXT NOT NULL,   -- base64, 16 bytes, per user
  iterations     INTEGER NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'UTC',   -- IANA name; every `date` below is resolved in it
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- OAuth clients, created by dynamic client registration (RFC 7591). Claude and ChatGPT both
-- register themselves on first connect; nobody types a client id.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id      TEXT PRIMARY KEY,
  client_name    TEXT NOT NULL DEFAULT '',
  redirect_uris  TEXT NOT NULL,   -- JSON array
  created_at     TEXT NOT NULL
);

-- Authorization codes. Single-use, short-lived, PKCE-bound. Only the hash is stored, so a
-- database read cannot replay one.
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash       TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,
  scope           TEXT NOT NULL DEFAULT '',
  expires_at      INTEGER NOT NULL,  -- unix seconds
  used_at         INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_codes_expiry ON auth_codes (expires_at);

-- Access and refresh tokens. Hash-only, same reasoning.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash   TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,     -- 'access' | 'refresh' | 'session'
  user_id      TEXT NOT NULL,
  client_id    TEXT,
  scope        TEXT NOT NULL DEFAULT '',
  expires_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens (user_id, kind);
CREATE INDEX IF NOT EXISTS tokens_expiry ON tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Personal data. Every table is user-scoped and cascades on account deletion.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS goals (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  calories    REAL,
  protein     REAL,
  carbs       REAL,
  fats        REAL,
  water_ml    REAL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,               -- YYYY-MM-DD in the user's timezone
  meal_type   TEXT,                        -- breakfast | lunch | dinner | snack
  name        TEXT NOT NULL,
  calories    REAL NOT NULL DEFAULT 0,
  protein     REAL NOT NULL DEFAULT 0,
  carbs       REAL NOT NULL DEFAULT 0,
  fats        REAL NOT NULL DEFAULT 0,
  notes       TEXT NOT NULL DEFAULT '',
  logged_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meals_user_date ON meals (user_id, date DESC);

CREATE TABLE IF NOT EXISTS water_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  amount_ml   REAL NOT NULL,
  logged_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS water_user_date ON water_logs (user_id, date DESC);

CREATE TABLE IF NOT EXISTS workouts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date             TEXT NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER,
  logged_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workouts_user_date ON workouts (user_id, date DESC);

CREATE TABLE IF NOT EXISTS workout_sets (
  id                  TEXT PRIMARY KEY,
  workout_id          TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_name       TEXT NOT NULL,
  anatome_exercise_id TEXT,               -- ext_id from the bundled catalog, when it resolved
  set_number          INTEGER NOT NULL,
  reps                INTEGER,
  weight              REAL,               -- kilograms. NOT weight_kg — see validate.ts aliases
  rpe                 REAL,
  notes               TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sets_workout ON workout_sets (workout_id, set_number);
CREATE INDEX IF NOT EXISTS sets_user_exercise ON workout_sets (user_id, exercise_name);

CREATE TABLE IF NOT EXISTS body_metrics (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_type  TEXT NOT NULL,             -- weight | body_fat | waist | ...
  value        REAL NOT NULL,
  unit         TEXT NOT NULL,
  date         TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  logged_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS metrics_user_type_date ON body_metrics (user_id, metric_type, date DESC);
