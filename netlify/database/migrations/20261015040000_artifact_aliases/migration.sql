CREATE TABLE IF NOT EXISTS artifact_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope_key text NOT NULL,
 alias text NOT NULL,
 artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,scope_key,alias)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS artifact_aliases_lookup_idx ON artifact_aliases(owner_id,scope_key,alias);--> statement-breakpoint
