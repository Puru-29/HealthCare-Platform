BEGIN;

CREATE TABLE user_auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_auth_identity_provider CHECK (provider = 'google'),
    CONSTRAINT user_auth_identity_subject_not_blank CHECK (length(btrim(provider_subject)) > 0),
    CONSTRAINT user_auth_identity_provider_subject_unique UNIQUE (provider, provider_subject),
    CONSTRAINT user_auth_identity_user_provider_unique UNIQUE (user_id, provider)
);

CREATE INDEX user_auth_identities_user_idx ON user_auth_identities (user_id);

COMMENT ON TABLE user_auth_identities IS
    'Verified external identities linked to existing CarePath user accounts.';

COMMIT;
