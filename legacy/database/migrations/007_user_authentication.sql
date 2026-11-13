BEGIN;

CREATE TABLE user_auth_credentials (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_normalized text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_auth_email_normalized CHECK (
        email_normalized = lower(btrim(email_normalized))
    ),
    CONSTRAINT user_auth_password_hash_format CHECK (
        password_hash ~ '^scrypt\$[A-Za-z0-9_-]{20,}\$[A-Za-z0-9_-]{80,}$'
    )
);

CREATE TABLE user_sessions (
    token_hash text PRIMARY KEY,
    csrf_token_hash text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_sessions_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT user_sessions_csrf_hash_format CHECK (csrf_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT user_sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX user_sessions_user_expiry_idx
    ON user_sessions (user_id, expires_at);

COMMENT ON TABLE user_auth_credentials IS
    'Scrypt password credentials for accounts. Existing profile rows receive no credentials automatically.';
COMMENT ON TABLE user_sessions IS
    'Revocable user sessions; only SHA-256 hashes of random cookie tokens are stored.';
COMMENT ON COLUMN user_auth_credentials.email_normalized IS
    'Unique, lowercase account login email. Email ownership is not verified until an email provider is configured.';

COMMIT;
