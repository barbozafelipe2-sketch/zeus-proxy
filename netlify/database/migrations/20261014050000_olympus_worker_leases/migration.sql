-- Phase 4: exclusive, time-bounded Olympus dispatch and execution ownership.
-- Additive only: existing production migrations are unchanged.
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS dispatch_token uuid,
  ADD COLUMN IF NOT EXISTS worker_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS executions_worker_lease_idx
  ON executions (owner_id,lease_expires_at)
  WHERE mode='OLYMPUS' AND state NOT IN ('COMPLETED','PARTIAL','FAILED','CANCELLED');
