BEGIN;

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL,
    email text,
    phone text,
    preferred_language text NOT NULL DEFAULT 'en',
    account_status user_account_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_display_name_not_blank CHECK (length(btrim(display_name)) > 0),
    CONSTRAINT users_email_not_blank CHECK (email IS NULL OR length(btrim(email)) > 0),
    CONSTRAINT users_phone_not_blank CHECK (phone IS NULL OR length(btrim(phone)) > 0),
    CONSTRAINT users_preferred_language_not_blank CHECK (length(btrim(preferred_language)) > 0)
);

CREATE TABLE hospitals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_name text NOT NULL,
    public_address text,
    public_city text,
    public_region text,
    public_postal_code text,
    public_phone text,
    public_website text,
    public_description text,
    public_facility_type text,
    public_location geography(Point, 4326),
    public_listing_status hospital_listing_status NOT NULL DEFAULT 'draft',
    public_source_name text,
    public_source_reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hospitals_public_name_not_blank CHECK (length(btrim(public_name)) > 0),
    CONSTRAINT hospitals_public_city_not_blank CHECK (
        public_city IS NULL OR length(btrim(public_city)) > 0
    )
);

CREATE TABLE hospital_verification_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    status hospital_verification_status NOT NULL,
    source_type data_source_type NOT NULL,
    source_name text NOT NULL,
    source_reference text,
    verified_name text,
    verified_address text,
    verified_city text,
    verified_region text,
    verified_postal_code text,
    verified_phone text,
    verified_website text,
    verified_facility_type text,
    verified_location geography(Point, 4326),
    last_verified_at timestamptz,
    expires_at timestamptz,
    verified_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    is_current boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hospital_verification_source_not_blank CHECK (length(btrim(source_name)) > 0),
    CONSTRAINT hospital_verification_current_verified_has_timestamp CHECK (
        status <> 'verified' OR last_verified_at IS NOT NULL
    ),
    CONSTRAINT hospital_verification_expiry_after_verification CHECK (
        expires_at IS NULL
        OR last_verified_at IS NULL
        OR expires_at >= last_verified_at
    )
);

CREATE TABLE hospital_services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    public_specialty_name text NOT NULL,
    verified_specialty_name text,
    public_description text,
    verified_description text,
    is_publicly_listed boolean NOT NULL DEFAULT true,
    verification_status hospital_verification_status NOT NULL DEFAULT 'pending',
    source_type data_source_type,
    source_name text,
    source_reference text,
    last_verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hospital_services_public_specialty_not_blank CHECK (
        length(btrim(public_specialty_name)) > 0
    ),
    CONSTRAINT hospital_services_verified_specialty_not_blank CHECK (
        verified_specialty_name IS NULL OR length(btrim(verified_specialty_name)) > 0
    ),
    CONSTRAINT hospital_services_verified_requires_timestamp CHECK (
        verification_status <> 'verified' OR last_verified_at IS NOT NULL
    ),
    CONSTRAINT hospital_services_source_pair CHECK (
        (source_type IS NULL AND source_name IS NULL)
        OR (source_type IS NOT NULL AND source_name IS NOT NULL AND length(btrim(source_name)) > 0)
    )
);

CREATE TABLE doctors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_display_name text NOT NULL,
    public_specialty text NOT NULL,
    public_registration_number text,
    public_description text,
    verified_display_name text,
    verified_specialty text,
    verified_registration_number text,
    verification_status doctor_verification_status NOT NULL DEFAULT 'unverified',
    verification_source_type data_source_type,
    verification_source_name text,
    verification_source_reference text,
    last_verified_at timestamptz,
    is_publicly_listed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT doctors_public_name_not_blank CHECK (length(btrim(public_display_name)) > 0),
    CONSTRAINT doctors_public_specialty_not_blank CHECK (length(btrim(public_specialty)) > 0),
    CONSTRAINT doctors_verified_requires_timestamp CHECK (
        verification_status <> 'verified' OR last_verified_at IS NOT NULL
    ),
    CONSTRAINT doctors_verification_source_pair CHECK (
        (verification_source_type IS NULL AND verification_source_name IS NULL)
        OR (
            verification_source_type IS NOT NULL
            AND verification_source_name IS NOT NULL
            AND length(btrim(verification_source_name)) > 0
        )
    )
);

CREATE TABLE doctor_hospital_affiliations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    public_title text,
    status affiliation_status NOT NULL DEFAULT 'pending',
    is_publicly_listed boolean NOT NULL DEFAULT false,
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT doctor_hospital_affiliations_dates_valid CHECK (
        ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at
    ),
    CONSTRAINT doctor_hospital_affiliations_pair_unique UNIQUE (doctor_id, hospital_id),
    CONSTRAINT doctor_hospital_affiliations_id_pair_unique UNIQUE (id, doctor_id, hospital_id)
);

CREATE TABLE insurance_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    public_website text,
    public_support_phone text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT insurance_providers_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE insurance_hospital_networks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    insurance_provider_id uuid NOT NULL REFERENCES insurance_providers(id) ON DELETE RESTRICT,
    hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    plan_name text NOT NULL,
    status insurance_network_status NOT NULL DEFAULT 'pending',
    source_type data_source_type,
    source_name text,
    source_reference text,
    last_verified_at timestamptz,
    valid_from date,
    valid_until date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT insurance_network_plan_not_blank CHECK (length(btrim(plan_name)) > 0),
    CONSTRAINT insurance_network_dates_valid CHECK (
        valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
    ),
    CONSTRAINT insurance_network_source_pair CHECK (
        (source_type IS NULL AND source_name IS NULL)
        OR (source_type IS NOT NULL AND source_name IS NOT NULL AND length(btrim(source_name)) > 0)
    ),
    CONSTRAINT insurance_network_provider_hospital_plan_unique
        UNIQUE (insurance_provider_id, hospital_id, plan_name)
);

CREATE TABLE appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    doctor_id uuid NOT NULL,
    hospital_id uuid NOT NULL,
    status appointment_status NOT NULL DEFAULT 'requested',
    mode appointment_mode NOT NULL DEFAULT 'in_person',
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT appointments_end_after_start CHECK (
        ends_at IS NULL OR ends_at > starts_at
    ),
    CONSTRAINT appointments_affiliated_doctor_hospital_fk
        FOREIGN KEY (doctor_id, hospital_id)
        REFERENCES doctor_hospital_affiliations (doctor_id, hospital_id)
        ON DELETE RESTRICT
);

CREATE TABLE ambulance_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    public_phone text,
    public_website text,
    status ambulance_provider_status NOT NULL DEFAULT 'inactive',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ambulance_providers_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE ambulance_vehicles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambulance_provider_id uuid NOT NULL
        REFERENCES ambulance_providers(id) ON DELETE RESTRICT,
    vehicle_type text NOT NULL,
    registration_number text,
    status ambulance_vehicle_status NOT NULL DEFAULT 'unavailable',
    last_known_location geography(Point, 4326),
    location_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ambulance_vehicles_type_not_blank CHECK (length(btrim(vehicle_type)) > 0),
    CONSTRAINT ambulance_vehicles_location_timestamp_pair CHECK (
        (last_known_location IS NULL AND location_updated_at IS NULL)
        OR (last_known_location IS NOT NULL AND location_updated_at IS NOT NULL)
    ),
    CONSTRAINT ambulance_vehicles_provider_registration_unique
        UNIQUE (ambulance_provider_id, registration_number),
    CONSTRAINT ambulance_vehicles_id_provider_unique
        UNIQUE (id, ambulance_provider_id)
);

CREATE TABLE ambulance_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    status ambulance_request_status NOT NULL DEFAULT 'requested',
    pickup_location geography(Point, 4326) NOT NULL,
    destination_hospital_id uuid REFERENCES hospitals(id) ON DELETE RESTRICT,
    ambulance_provider_id uuid REFERENCES ambulance_providers(id) ON DELETE RESTRICT,
    ambulance_vehicle_id uuid,
    external_dispatch_reference text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    dispatched_at timestamptz,
    arrived_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ambulance_request_vehicle_provider_pair CHECK (
        ambulance_vehicle_id IS NULL OR ambulance_provider_id IS NOT NULL
    ),
    CONSTRAINT ambulance_request_vehicle_provider_fk
        FOREIGN KEY (ambulance_vehicle_id, ambulance_provider_id)
        REFERENCES ambulance_vehicles (id, ambulance_provider_id)
        ON DELETE RESTRICT,
    CONSTRAINT ambulance_request_acceptance_after_request CHECK (
        accepted_at IS NULL OR accepted_at >= requested_at
    ),
    CONSTRAINT ambulance_request_dispatch_after_acceptance CHECK (
        dispatched_at IS NULL
        OR accepted_at IS NULL
        OR dispatched_at >= accepted_at
    ),
    CONSTRAINT ambulance_request_arrival_after_dispatch CHECK (
        arrived_at IS NULL
        OR dispatched_at IS NULL
        OR arrived_at >= dispatched_at
    ),
    CONSTRAINT ambulance_request_completion_after_arrival CHECK (
        completed_at IS NULL
        OR arrived_at IS NULL
        OR completed_at >= arrived_at
    ),
    CONSTRAINT ambulance_request_cancellation_after_request CHECK (
        cancelled_at IS NULL OR cancelled_at >= requested_at
    )
);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_action_not_blank CHECK (length(btrim(action)) > 0),
    CONSTRAINT audit_logs_entity_type_not_blank CHECK (length(btrim(entity_type)) > 0),
    CONSTRAINT audit_logs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE users IS
    'Minimal account profile only. Authentication credentials and clinical history are intentionally out of scope.';
COMMENT ON TABLE hospitals IS
    'Publicly listed hospital fields. Provider-verified snapshots are stored separately in hospital_verification_records.';
COMMENT ON TABLE hospital_verification_records IS
    'Append-only source and verification history; the current row supplies verified hospital data and last_verified_at.';
COMMENT ON TABLE hospital_services IS
    'Publicly listed specialties are distinct from optional provider-verified specialty and description fields.';
COMMENT ON TABLE doctors IS
    'Public doctor directory fields are distinct from provider-verified fields. No patient clinical notes are stored here.';
COMMENT ON TABLE appointments IS
    'Scheduling metadata only. Do not add diagnoses, symptoms, treatment notes, or medical-record payloads here.';
COMMENT ON TABLE ambulance_requests IS
    'Future dispatch workflow metadata. Pickup is a geography point; no diagnosis or emergency narrative is stored.';
COMMENT ON TABLE audit_logs IS
    'Audit metadata must be sanitized and must not contain credentials, policy numbers, or clinical/health information.';

COMMIT;
