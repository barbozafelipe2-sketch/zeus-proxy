-- OH-004.2.8 Hard Fix 1: canonical project conversations, idempotent turns,
-- and deterministic project deletion semantics. The original foundation
-- migration is intentionally untouched.

-- Merge any legacy duplicate project conversations into the oldest canonical one.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS canonical_id,
         row_number() OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS rn
  FROM conversations
  WHERE project_id IS NOT NULL
), dups AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE executions e SET conversation_id=d.canonical_id FROM dups d WHERE e.conversation_id=d.id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS canonical_id,
         row_number() OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS rn
  FROM conversations
  WHERE project_id IS NOT NULL
), dups AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE messages m SET conversation_id=d.canonical_id FROM dups d WHERE m.conversation_id=d.id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS canonical_id,
         row_number() OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS rn
  FROM conversations
  WHERE project_id IS NOT NULL
), dups AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE artifacts a SET conversation_id=d.canonical_id FROM dups d WHERE a.conversation_id=d.id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS canonical_id,
         row_number() OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS rn
  FROM conversations
  WHERE project_id IS NOT NULL
), dups AS (SELECT id, canonical_id FROM ranked WHERE rn > 1)
UPDATE files f SET conversation_id=d.canonical_id FROM dups d WHERE f.conversation_id=d.id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY owner_id, project_id ORDER BY created_at ASC, id ASC) AS rn
  FROM conversations
  WHERE project_id IS NOT NULL
)
DELETE FROM conversations c USING ranked r WHERE c.id=r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_owner_project_canonical_idx
  ON conversations(owner_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS executions_owner_request_id_idx
  ON executions(owner_id, request_id)
  WHERE request_id IS NOT NULL;

-- Deleting a project means deleting its workspace data, not silently converting it
-- into Home data. Binary blob cleanup is handled separately by storage maintenance.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_project_id_projects_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_project_id_projects_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_project_id_fkey;
ALTER TABLE files ADD CONSTRAINT files_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_project_id_projects_id_fkey;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_project_id_projects_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
