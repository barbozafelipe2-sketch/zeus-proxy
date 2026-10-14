-- Optional Google OAuth connections for the private Zeus Proxy owner.
-- Refresh tokens are encrypted in the Function with a server-only key.
CREATE TABLE IF NOT EXISTS google_connections (
 owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 service text NOT NULL CHECK (service IN ('gmail','calendar','drive')),
 google_account text NOT NULL DEFAULT '',
 access_ciphertext text NOT NULL,
 refresh_ciphertext text,
 expires_at timestamptz,
 scopes text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_id,service)
);
CREATE INDEX IF NOT EXISTS google_connections_owner_idx ON google_connections(owner_id);
