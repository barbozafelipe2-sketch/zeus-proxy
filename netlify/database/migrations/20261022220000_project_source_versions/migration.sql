CREATE TABLE IF NOT EXISTS project_source_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES project_sources(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  source_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, revision)
);--> statement-breakpoint
INSERT INTO project_source_versions(owner_id,project_id,source_id,title,content,revision,source_file_id,created_at)
SELECT owner_id,project_id,id,title,content,revision,source_file_id,updated_at
FROM project_sources
ON CONFLICT (source_id,revision) DO NOTHING;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_source_versions_owner_project_idx
ON project_source_versions(owner_id,project_id,source_id,revision DESC);
