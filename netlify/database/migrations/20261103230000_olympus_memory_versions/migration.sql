-- Olympus Memory Engine: append-only revisions for approved memories.
-- Existing memory reads/writes remain unchanged. Deleting a memory cascades
-- to its revision history, so deletion cannot leave behind personal content.
CREATE TABLE IF NOT EXISTS olympus_memory_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  type text NOT NULL,
  content text NOT NULL,
  source text,
  confidence integer,
  approved boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(memory_id,version)
);
CREATE INDEX IF NOT EXISTS olympus_memory_versions_owner_memory_idx
 ON olympus_memory_versions(owner_id,memory_id,version DESC);
CREATE OR REPLACE FUNCTION olympus_record_memory_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version integer;
BEGIN
  -- No audit snapshot for metadata-only changes; avoid needless copies.
  IF (OLD.content,OLD.type,OLD.source,OLD.confidence,OLD.approved,OLD.project_id)
     IS NOT DISTINCT FROM
     (NEW.content,NEW.type,NEW.source,NEW.confidence,NEW.approved,NEW.project_id) THEN
    RETURN NEW;
  END IF;
  -- A memory may never change ownership through an update.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'memory owner cannot change';
  END IF;
  SELECT COALESCE(MAX(version),0)+1 INTO next_version
    FROM olympus_memory_versions WHERE memory_id=OLD.id;
  INSERT INTO olympus_memory_versions(memory_id,owner_id,project_id,version,type,content,source,confidence,approved)
    VALUES(OLD.id,OLD.owner_id,OLD.project_id,next_version,OLD.type,OLD.content,OLD.source,OLD.confidence,OLD.approved);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS olympus_memory_revision_trigger ON memories;
CREATE TRIGGER olympus_memory_revision_trigger
 BEFORE UPDATE ON memories
 FOR EACH ROW EXECUTE FUNCTION olympus_record_memory_revision();
