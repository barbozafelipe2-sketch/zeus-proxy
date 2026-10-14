-- Append-only admission ledger: one row per authorized initial run or paid-capable retry.
-- Do not modify historical applied migrations.
CREATE TABLE IF NOT EXISTS execution_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  mode intelligence_mode NOT NULL,
  attempt_kind text NOT NULL CHECK (attempt_kind IN ('initial','retry')),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS execution_attempts_hourly_idx
  ON execution_attempts (owner_id, mode, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS execution_attempts_execution_idx
  ON execution_attempts (execution_id, created_at DESC);
