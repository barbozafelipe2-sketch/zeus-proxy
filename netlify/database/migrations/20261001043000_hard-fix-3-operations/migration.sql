-- OH-004.2.10 Hard Fix 3: operational rate events and durable blob garbage-collection queue.
-- Foundation migrations remain untouched.

CREATE TABLE IF NOT EXISTS request_rate_events (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  request_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(owner_id, kind, request_id)
);
CREATE INDEX IF NOT EXISTS request_rate_events_window_idx
  ON request_rate_events(owner_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS request_rate_events_created_idx
  ON request_rate_events(created_at);

CREATE TABLE IF NOT EXISTS blob_gc_queue (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  blob_key text NOT NULL,
  reason text NOT NULL DEFAULT 'cleanup',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(store_name, blob_key)
);
CREATE INDEX IF NOT EXISTS blob_gc_queue_owner_idx
  ON blob_gc_queue(owner_id, created_at ASC);

-- Keep rate-event storage bounded without requiring an external cron job.
-- Each rate-limited request opportunistically deletes stale events older than 48 hours.
