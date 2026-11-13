BEGIN;

CREATE TABLE hospital_source_observation_review_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id text NOT NULL,
    source_observation_a_id uuid NOT NULL
        REFERENCES hospital_source_observations(id) ON DELETE RESTRICT,
    source_observation_b_id uuid NOT NULL
        REFERENCES hospital_source_observations(id) ON DELETE RESTRICT,
    decision_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    decision text NOT NULL,
    reason text NOT NULL,
    evidence_reference text NOT NULL,
    reviewer text NOT NULL,
    reviewed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hospital_source_review_id_format CHECK (
        review_id ~ '^[^#]+#entries-[0-9]+-[0-9]+$'
    ),
    CONSTRAINT hospital_source_review_distinct_observations CHECK (
        source_observation_a_id <> source_observation_b_id
    ),
    CONSTRAINT hospital_source_review_decision_valid CHECK (
        decision IN ('same_hospital', 'different_hospitals', 'needs_more_evidence')
    ),
    CONSTRAINT hospital_source_review_reason_not_blank CHECK (
        length(btrim(reason)) > 0
    ),
    CONSTRAINT hospital_source_review_evidence_not_blank CHECK (
        length(btrim(evidence_reference)) > 0
    ),
    CONSTRAINT hospital_source_review_reviewer_not_blank CHECK (
        length(btrim(reviewer)) > 0
    )
);

CREATE INDEX hospital_source_review_decisions_latest_idx
    ON hospital_source_observation_review_decisions (review_id, decision_number DESC);

CREATE INDEX hospital_source_review_decisions_observations_idx
    ON hospital_source_observation_review_decisions (
        source_observation_a_id,
        source_observation_b_id,
        reviewed_at DESC
    );

COMMENT ON TABLE hospital_source_observation_review_decisions IS
    'Admin decision history for source-observation pairs. A decision is not verification or publication authorization.';

COMMENT ON COLUMN hospital_source_observation_review_decisions.decision IS
    'different_hospitals may authorize separate draft records; same_hospital and needs_more_evidence never create records.';

COMMIT;
