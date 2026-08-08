-- Shareable view links.
--
-- The assistant can log and read back, but a person cannot *look* at any of it — and "show me
-- my last eight weeks" is a picture, not a paragraph. A view link is a URL the assistant mints
-- on request that opens a rendered dashboard: today against goals, weight trend, training
-- volume, recent sessions, supplement adherence.
--
-- It is a bearer URL, so it is treated like one:
--   - only the SHA-256 of the token is stored, so a database read cannot reopen anyone's link;
--   - it expires (default 24h, 30 days maximum) and can be revoked;
--   - it is read-only unless the caller explicitly asked for an editable one;
--   - the page is noindex and Cache-Control: private, no-store.
--
-- Deliberately NOT a second auth system: a link grants exactly one user's own data and nothing
-- else, and it cannot be exchanged for an API token.

CREATE TABLE IF NOT EXISTS view_links (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',   -- "for my coach", so a list of links is readable
  can_edit     INTEGER NOT NULL DEFAULT 0, -- 0 = read-only. Opt in, never the default.
  expires_at   INTEGER NOT NULL,           -- unix seconds
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER,
  view_count   INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS view_links_user ON view_links (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS view_links_expiry ON view_links (expires_at);
