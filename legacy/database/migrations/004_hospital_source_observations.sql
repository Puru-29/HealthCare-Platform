BEGIN;

CREATE TABLE hospital_source_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id uuid REFERENCES hospitals(id) ON DELETE RESTRICT,
    source_system text NOT NULL,
    source_hospital_id text NOT NULL,
    source_document text NOT NULL,
    source_document_sha256 text NOT NULL,
    source_date date NOT NULL,
    source_page integer,
    source_hospital_name text NOT NULL,
    source_ownership_type text,
    source_email text,
    source_contact_phone text,
    source_nodal_officer_name text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT hospital_source_observations_system_not_blank
        CHECK (source_system ~ '^[a-z0-9][a-z0-9._:-]*$'),
    CONSTRAINT hospital_source_observations_id_not_blank
        CHECK (source_hospital_id ~ '^[a-z0-9][a-z0-9._:-]*$'),
    CONSTRAINT hospital_source_observations_document_not_blank
        CHECK (length(btrim(source_document)) > 0),
    CONSTRAINT hospital_source_observations_document_hash_valid
        CHECK (source_document_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT hospital_source_observations_name_not_blank
        CHECK (length(btrim(source_hospital_name)) > 0),
    CONSTRAINT hospital_source_observations_page_positive
        CHECK (source_page IS NULL OR source_page > 0),
    CONSTRAINT hospital_source_observations_ownership_valid
        CHECK (
            source_ownership_type IS NULL
            OR source_ownership_type IN ('Public', 'Private')
        ),
    CONSTRAINT hospital_source_observations_optional_text_not_blank
        CHECK (
            (source_email IS NULL OR length(btrim(source_email)) > 0)
            AND (source_contact_phone IS NULL OR length(btrim(source_contact_phone)) > 0)
            AND (
                source_nodal_officer_name IS NULL
                OR length(btrim(source_nodal_officer_name)) > 0
            )
        )
);

CREATE UNIQUE INDEX hospital_source_observations_identity_unique_idx
    ON hospital_source_observations (
        source_system COLLATE "C",
        source_hospital_id COLLATE "C",
        source_document_sha256 COLLATE "C"
    );

CREATE INDEX hospital_source_observations_document_hash_idx
    ON hospital_source_observations (source_document_sha256);

CREATE INDEX hospital_source_observations_hospital_history_idx
    ON hospital_source_observations (hospital_id, source_date DESC)
    WHERE hospital_id IS NOT NULL;

CREATE INDEX hospital_source_observations_unlinked_review_idx
    ON hospital_source_observations (source_date DESC, source_system)
    WHERE hospital_id IS NULL;

COMMENT ON TABLE hospital_source_observations IS
    'Historical observations copied from external source documents. These values are not independently verified and are not public hospital fields.';

COMMENT ON COLUMN hospital_source_observations.hospital_id IS
    'Optional adjudicated link. Similar names or matching source IDs do not automatically link or merge hospitals.';

COMMENT ON COLUMN hospital_source_observations.source_ownership_type IS
    'Ownership classification as stated by the source, not a facility type or independently verified attribute.';

COMMIT;
