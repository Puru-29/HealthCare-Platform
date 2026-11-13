BEGIN;

ALTER TABLE hospital_source_observations
    ADD COLUMN source_row_payload jsonb;

ALTER TABLE hospital_source_observations
    ADD CONSTRAINT hospital_source_observations_source_row_payload_valid
    CHECK (
        source_row_payload IS NULL
        OR (
            jsonb_typeof(source_row_payload) = 'object'
            AND source_row_payload ?& ARRAY[
                'source_document',
                'source_date',
                'source_page',
                'record_type',
                'pdf_entry_number',
                'hospital_id',
                'hospital_name',
                'hospital_name_source',
                'hospital_type',
                'email',
                'email_source',
                'nodal_officer_name',
                'contact_number',
                'contact_number_source',
                'verification_status',
                'extraction_review_status',
                'extraction_notes'
            ]
            AND jsonb_typeof(source_row_payload -> 'source_document') = 'string'
            AND jsonb_typeof(source_row_payload -> 'source_date') = 'string'
            AND jsonb_typeof(source_row_payload -> 'source_page') = 'string'
            AND jsonb_typeof(source_row_payload -> 'record_type') = 'string'
            AND jsonb_typeof(source_row_payload -> 'pdf_entry_number') = 'string'
            AND jsonb_typeof(source_row_payload -> 'hospital_id') = 'string'
            AND jsonb_typeof(source_row_payload -> 'hospital_name') = 'string'
            AND jsonb_typeof(source_row_payload -> 'hospital_name_source') = 'string'
            AND jsonb_typeof(source_row_payload -> 'hospital_type') = 'string'
            AND jsonb_typeof(source_row_payload -> 'email') = 'string'
            AND jsonb_typeof(source_row_payload -> 'email_source') = 'string'
            AND jsonb_typeof(source_row_payload -> 'nodal_officer_name') = 'string'
            AND jsonb_typeof(source_row_payload -> 'contact_number') = 'string'
            AND jsonb_typeof(source_row_payload -> 'contact_number_source') = 'string'
            AND jsonb_typeof(source_row_payload -> 'verification_status') = 'string'
            AND jsonb_typeof(source_row_payload -> 'extraction_review_status') = 'string'
            AND jsonb_typeof(source_row_payload -> 'extraction_notes') = 'string'
        )
    );

COMMENT ON COLUMN hospital_source_observations.source_row_payload IS
    'Optional complete raw CSV row as string-valued JSON object. Legacy observations may remain NULL; new CSV importers must preserve every source column without normalization.';

COMMIT;
