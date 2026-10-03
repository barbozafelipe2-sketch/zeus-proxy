CREATE TABLE IF NOT EXISTS "files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "blob_key" text NOT NULL,
  "size" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'READY',
  "extracted_text" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "files_owner_idx" ON "files" ("owner_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "files_project_idx" ON "files" ("project_id");
CREATE INDEX IF NOT EXISTS "files_conversation_idx" ON "files" ("conversation_id");
