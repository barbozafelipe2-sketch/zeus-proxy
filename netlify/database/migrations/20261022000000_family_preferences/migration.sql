ALTER TABLE zeus_user_preferences
  ADD COLUMN IF NOT EXISTS family_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
