-- Add the durable Olympus background queue state without modifying any applied migration.
-- Netlify Database applies migrations in ascending order before publishing the new deployment.
-- Keep this ALTER TYPE in its own migration: a newly added enum value is usable only after commit.
ALTER TYPE "execution_state" ADD VALUE IF NOT EXISTS 'QUEUED';
