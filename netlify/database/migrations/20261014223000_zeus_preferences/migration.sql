CREATE TABLE IF NOT EXISTS zeus_user_preferences (
  owner_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  personality text NOT NULL DEFAULT 'balanced',
  instructions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zeus_personality_choice CHECK (personality IN ('balanced','direct','warm','creative','professional'))
);
