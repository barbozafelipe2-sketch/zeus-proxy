CREATE TABLE IF NOT EXISTS olympus_job_budgets (
 execution_id uuid PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 authorized_cents integer NOT NULL DEFAULT 800 CHECK (authorized_cents >= 800 AND (authorized_cents-800)%500=0),
 reserved_cents integer NOT NULL DEFAULT 0 CHECK (reserved_cents>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS olympus_call_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 execution_id uuid NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider text NOT NULL,
 model text NOT NULL,
 max_cents integer NOT NULL CHECK (max_cents>0),
 status text NOT NULL DEFAULT 'UNCERTAIN' CHECK (status IN ('UNCERTAIN','SETTLED')),
 created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS olympus_reservations_by_execution ON olympus_call_reservations(owner_id,execution_id);--> statement-breakpoint
