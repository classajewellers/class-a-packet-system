-- 064_rate_limits.sql
-- Distributed rate limiting: fixed-window counters per key+window pair

CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT        NOT NULL,
  window_key TEXT        NOT NULL,
  count      INTEGER     NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rate_limits_pk PRIMARY KEY (key, window_key)
);
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ADD COLUMN IF NOT EXISTS count      INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE rate_limits ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour';
ALTER TABLE rate_limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at);

-- Atomic upsert-and-increment — returns the new count after this request.
-- Used by both the middleware (via REST API) and route-level helpers.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_key        TEXT,
  p_window_key TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO rate_limits (key, window_key, count, expires_at)
  VALUES (p_key, p_window_key, 1, p_expires_at)
  ON CONFLICT (key, window_key) DO UPDATE
    SET count = rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- Run periodically to prune stale rows (pg_cron or Vercel cron → /api/admin/cleanup).
-- Old rows are harmless to correctness but will accumulate without cleanup.
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits WHERE expires_at < NOW();
END;
$$;
