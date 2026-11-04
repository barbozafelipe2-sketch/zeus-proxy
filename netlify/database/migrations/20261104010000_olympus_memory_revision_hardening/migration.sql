CREATE OR REPLACE FUNCTION olympus_record_memory_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_version integer;
BEGIN
 IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
  RAISE EXCEPTION 'memory owner cannot change';
 END IF;
 IF (OLD.content,OLD.type,OLD.source,OLD.confidence,OLD.approved,OLD.project_id)
 IS NOT DISTINCT FROM (NEW.content,NEW.type,NEW.source,NEW.confidence,NEW.approved,NEW.project_id) THEN
  RETURN NEW;
 END IF;
 SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM olympus_memory_versions WHERE memory_id=OLD.id;
 INSERT INTO olympus_memory_versions(memory_id,owner_id,project_id,version,type,content,source,confidence,approved)
 VALUES(OLD.id,OLD.owner_id,OLD.project_id,next_version,OLD.type,OLD.content,OLD.source,OLD.confidence,OLD.approved);
 RETURN NEW;
END;
$$;
