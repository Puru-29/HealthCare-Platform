BEGIN;

DO $$
DECLARE
    test_hospital_id uuid;
    payload_fixture jsonb := $payload$
    {
        "source_document": "202608041074356704.pdf",
        "source_date": "2026-08-03",
        "source_page": "1",
        "record_type": "pmjay_empanelled_hospital",
        "pdf_entry_number": "1",
        "hospital_id": "HOSP6G25147105",
        "hospital_name": "Phc banwasa",
        "hospital_name_source": "Phc banwasa",
        "hospital_type": "Public",
        "email": "phcbanwasa@gmail.com",
        "email_source": "phcbanwasa@gmail.com",
        "nodal_officer_name": "Aman Singh",
        "contact_number": "9992420825",
        "contact_number_source": "9992420825",
        "verification_status": "unverified",
        "extraction_review_status": "extracted",
        "extraction_notes": ""
    }
    $payload$::jsonb;
    invalid_case record;
    rejected boolean;
BEGIN
    INSERT INTO hospitals (public_name)
    VALUES ('Migration 004 disposable-database test')
    RETURNING id INTO test_hospital_id;

    INSERT INTO hospital_source_observations (
        hospital_id,
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_page,
        source_hospital_name,
        source_ownership_type
    ) VALUES (
        NULL,
        'source-a',
        'hosp-001',
        'source.pdf',
        repeat('a', 64),
        DATE '2026-08-03',
        1,
        'Source A Hospital',
        'Public'
    );

    IF NOT EXISTS (
        SELECT 1 FROM hospital_source_observations
        WHERE source_system = 'source-a'
          AND source_hospital_id = 'hosp-001'
          AND hospital_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Unlinked source observation was not retained.';
    END IF;

    INSERT INTO hospital_source_observations (
        hospital_id,
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_hospital_name
    ) VALUES (
        test_hospital_id,
        'source-b',
        'facility-91',
        'renamed-copy.pdf',
        repeat('b', 64),
        DATE '2026-08-03',
        'Source B Hospital'
    );

    INSERT INTO hospital_source_observations (
        hospital_id,
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_hospital_name
    ) VALUES (
        test_hospital_id,
        'source-c',
        'facility-92',
        'other-source.pdf',
        repeat('c', 64),
        DATE '2026-08-03',
        'Source C Hospital'
    );

    IF (
        SELECT count(*)
        FROM hospital_source_observations
        WHERE hospital_id = test_hospital_id
    ) <> 2 THEN
        RAISE EXCEPTION 'Multiple source observations could not link to one hospital.';
    END IF;

    INSERT INTO hospital_source_observations (
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_page,
        source_hospital_name,
        source_ownership_type,
        source_email,
        source_contact_phone,
        source_nodal_officer_name,
        source_row_payload
    ) VALUES (
        'pm-jay',
        'payload-valid',
        '202608041074356704.pdf',
        repeat('2', 64),
        DATE '2026-08-03',
        1,
        'Phc banwasa',
        'Public',
        'phcbanwasa@gmail.com',
        '9992420825',
        'Aman Singh',
        payload_fixture
    );

    IF NOT EXISTS (
        SELECT 1
        FROM hospital_source_observations
        WHERE source_system = 'pm-jay'
          AND source_hospital_id = 'payload-valid'
          AND source_row_payload = payload_fixture
          AND source_row_payload ->> 'extraction_notes' = ''
          AND source_row_payload ->> 'email_source' = 'phcbanwasa@gmail.com'
    ) THEN
        RAISE EXCEPTION 'A complete source-row payload was not stored exactly, including empty strings.';
    END IF;

    INSERT INTO hospital_source_observations (
        source_system,
        source_hospital_id,
        source_document,
        source_document_sha256,
        source_date,
        source_hospital_name,
        source_row_payload
    ) VALUES (
        'pm-jay',
        'payload-legacy-null',
        '202608041074356704.pdf',
        repeat('3', 64),
        DATE '2026-08-03',
        'Legacy payload compatibility',
        NULL
    );

    IF NOT EXISTS (
        SELECT 1
        FROM hospital_source_observations
        WHERE source_system = 'pm-jay'
          AND source_hospital_id = 'payload-legacy-null'
          AND source_row_payload IS NULL
    ) THEN
        RAISE EXCEPTION 'SQL NULL source_row_payload was not accepted for backward compatibility.';
    END IF;

    FOR invalid_case IN
        SELECT cases.label, cases.payload
        FROM (VALUES
            ('missing-required-key', payload_fixture - 'extraction_notes'),
            ('numeric-value', jsonb_set(payload_fixture, '{source_page}', '1'::jsonb)),
            ('boolean-value', jsonb_set(payload_fixture, '{source_page}', 'true'::jsonb)),
            ('json-null-value', jsonb_set(payload_fixture, '{source_page}', 'null'::jsonb)),
            ('nested-object-value', jsonb_set(payload_fixture, '{source_page}', '{"value":"1"}'::jsonb)),
            ('top-level-array', '[]'::jsonb),
            ('top-level-scalar', '"not-an-object"'::jsonb),
            ('top-level-json-null', 'null'::jsonb)
        ) AS cases(label, payload)
    LOOP
        rejected := false;
        BEGIN
            INSERT INTO hospital_source_observations (
                source_system,
                source_hospital_id,
                source_document,
                source_document_sha256,
                source_date,
                source_hospital_name,
                source_row_payload
            ) VALUES (
                'pm-jay',
                'payload-invalid-' || invalid_case.label,
                '202608041074356704.pdf',
                repeat('4', 64),
                DATE '2026-08-03',
                'Invalid payload test',
                invalid_case.payload
            );
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'Invalid source_row_payload unexpectedly accepted: ' || invalid_case.label;
        EXCEPTION WHEN check_violation THEN
            rejected := true;
        END;

        IF NOT rejected THEN
            RAISE EXCEPTION 'Invalid source_row_payload was not rejected: %', invalid_case.label;
        END IF;
    END LOOP;

    BEGIN
        INSERT INTO hospital_source_observations (
            source_system, source_hospital_id, source_document,
            source_document_sha256, source_date, source_hospital_name
        ) VALUES (
            'source-a', 'hosp-001', 'renamed-source.pdf',
            repeat('a', 64), DATE '2026-09-01', 'Changed source date'
        );
        RAISE EXCEPTION 'Expected duplicate source identity to be rejected.';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO hospital_source_observations (
            hospital_id, source_system, source_hospital_id, source_document,
            source_document_sha256, source_date, source_hospital_name
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            'source-d', 'facility-1', 'orphan.pdf', repeat('d', 64),
            DATE '2026-08-03', 'Orphan'
        );
        RAISE EXCEPTION 'Expected invalid hospital foreign key to be rejected.';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO hospital_source_observations (
            source_system, source_hospital_id, source_document,
            source_document_sha256, source_date, source_hospital_name
        ) VALUES (
            'UPPERCASE', 'facility-1', 'bad-canonical.pdf',
            repeat('e', 64), DATE '2026-08-03', 'Bad canonical ID'
        );
        RAISE EXCEPTION 'Expected noncanonical source identity to be rejected.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO hospital_source_observations (
            source_system, source_hospital_id, source_document,
            source_document_sha256, source_date, source_page,
            source_hospital_name
        ) VALUES (
            'source-f', 'facility-1', 'bad-page.pdf',
            repeat('f', 64), DATE '2026-08-03', 0, 'Bad page'
        );
        RAISE EXCEPTION 'Expected invalid source page to be rejected.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO hospital_source_observations (
            source_system, source_hospital_id, source_document,
            source_document_sha256, source_date, source_hospital_name,
            source_ownership_type
        ) VALUES (
            'source-g', 'facility-1', 'bad-ownership.pdf',
            repeat('1', 64), DATE '2026-08-03', 'Bad ownership', 'Other'
        );
        RAISE EXCEPTION 'Expected invalid ownership to be rejected.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END;
$$;

ROLLBACK;
