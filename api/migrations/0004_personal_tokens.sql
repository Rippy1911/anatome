-- Personal API tokens.
--
-- OAuth covers the case it was designed for: a client that can open a browser. It does not cover
-- a shell script, a cron job, a Shortcut, or moving a year of logs into something else — and
-- "log my breakfast from a script" is a real request that should not require implementing an
-- OAuth client.
--
-- These are the same `tokens` rows the OAuth flow issues, with two additions: a human label so a
-- list of them is readable, and a long expiry. They are not a second auth system — one bearer
-- format, one verification path, one revocation path.

ALTER TABLE tokens ADD COLUMN label TEXT NOT NULL DEFAULT '';
