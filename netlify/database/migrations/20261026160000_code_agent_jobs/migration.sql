-- Durable, owner-scoped coding jobs. The job row is the FIFO queue entry;
-- workspace snapshots live in Netlify Blobs so a later background invocation
-- can restore the working tree after the original Function has ended.
CREATE TABLE IF NOT EXISTS code_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  request_id uuid NOT NULL,
  queue_sequence bigserial NOT NULL UNIQUE,
  repo_owner text NOT NULL CHECK (repo_owner ~ '^[A-Za-z0-9_.-]{1,100}$'),
  repo_name text NOT NULL CHECK (repo_name ~ '^[A-Za-z0-9_.-]{1,100}$'),
  target_branch text NOT NULL CHECK (target_branch ~ '^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,119}$'),
  request_text text NOT NULL CHECK (length(request_text) BETWEEN 1 AND 40000),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','PLANNING','AWAITING_APPROVAL','RUNNING','COMMITTING','COMPLETED','FAILED','CANCELLED')),
  requires_approval boolean NOT NULL DEFAULT true,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_phase integer NOT NULL DEFAULT 0 CHECK (current_phase >= 0),
  base_commit_sha text,
  base_workspace_blob_key text,
  base_workspace_manifest jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(base_workspace_manifest) = 'array'),
  workspace_blob_key text,
  workspace_manifest jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(workspace_manifest) = 'array'),
  commit_sha text,
  commit_recovery boolean NOT NULL DEFAULT false,
  result_summary text,
  error_code text,
  dispatch_token uuid,
  worker_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, request_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS code_agent_jobs_fifo_idx
  ON code_agent_jobs(owner_id, queue_sequence)
  WHERE status = 'QUEUED';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS code_agent_jobs_active_lease_idx
  ON code_agent_jobs(owner_id, lease_expires_at)
  WHERE status IN ('PLANNING','RUNNING','COMMITTING');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS code_agent_jobs_conversation_idx
  ON code_agent_jobs(owner_id, conversation_id, queue_sequence DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS code_agent_job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES code_agent_jobs(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('QUEUED','PHASE_STARTED','PHASE_COMPLETED','PROGRESS','PLAN_READY','APPROVED','COMMIT_STARTED','COMMIT_COMPLETED','FAILED','CANCELLED','MESSAGE_QUEUED')),
  phase integer CHECK (phase IS NULL OR phase >= 0),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 1200),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS code_agent_job_events_owner_idx
  ON code_agent_job_events(owner_id, job_id, id);
