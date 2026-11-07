CREATE TABLE IF NOT EXISTS project_continuity (
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 summary text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 source_message_count integer NOT NULL DEFAULT 0,
 last_message_at timestamptz,
 last_message_id uuid,
 status text NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','BUILDING','ERROR')),
 lease_token uuid,
 lease_expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,project_id),
 CHECK((last_message_at IS NULL)=(last_message_id IS NULL))
);
CREATE TABLE IF NOT EXISTS project_continuity_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id text NOT NULL,
 project_id uuid NOT NULL,
 revision integer NOT NULL,
 summary text NOT NULL,
 source_message_count integer NOT NULL,
 last_message_at timestamptz NOT NULL,
 last_message_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,project_id,revision),
 FOREIGN KEY(owner_id,project_id) REFERENCES project_continuity(owner_id,project_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS drive_write_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id text NOT NULL,
 project_id uuid NOT NULL,
 summary_revision integer NOT NULL,
 title text NOT NULL,
 content text NOT NULL,
 content_hash text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','IN_PROGRESS','COMPLETED','FAILED','CANCELLED')),
 lease_token uuid,
 lease_expires_at timestamptz,
 drive_file_id text,
 drive_url text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,project_id,summary_revision,content_hash),
 FOREIGN KEY(owner_id,project_id) REFERENCES project_continuity(owner_id,project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS drive_write_approvals_project_idx ON drive_write_approvals(owner_id,project_id,created_at DESC);