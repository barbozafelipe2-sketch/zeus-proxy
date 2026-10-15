CREATE TABLE IF NOT EXISTS project_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL, content text NOT NULL,
  source_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_sources_owner_project_idx ON project_sources(owner_id,project_id,active);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS production_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES executions(id) ON DELETE SET NULL,
  phase_number integer NOT NULL CHECK(phase_number>0),
  phase_label text NOT NULL,
  state text NOT NULL CHECK(state IN ('PENDING','RUNNING','COMPLETED','FAILED','PAUSED')),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_checkpoints_scope_idx ON production_checkpoints(owner_id,project_id,conversation_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS production_checkpoints_per_execution_phase_idx ON production_checkpoints(owner_id,execution_id,phase_number) WHERE execution_id IS NOT NULL;--> statement-breakpoint
