BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE user_account_status AS ENUM (
    'active',
    'suspended',
    'closed'
);

CREATE TYPE hospital_listing_status AS ENUM (
    'draft',
    'published',
    'hidden'
);

CREATE TYPE hospital_verification_status AS ENUM (
    'pending',
    'verified',
    'rejected',
    'expired',
    'disputed'
);

CREATE TYPE data_source_type AS ENUM (
    'provider',
    'government_registry',
    'public_directory',
    'insurer',
    'manual_review',
    'other'
);

CREATE TYPE doctor_verification_status AS ENUM (
    'unverified',
    'pending',
    'verified',
    'rejected',
    'expired'
);

CREATE TYPE affiliation_status AS ENUM (
    'active',
    'inactive',
    'pending'
);

CREATE TYPE insurance_network_status AS ENUM (
    'pending',
    'in_network',
    'out_of_network',
    'terminated'
);

CREATE TYPE appointment_status AS ENUM (
    'requested',
    'confirmed',
    'cancelled',
    'completed',
    'no_show'
);

CREATE TYPE appointment_mode AS ENUM (
    'in_person',
    'telehealth'
);

CREATE TYPE ambulance_provider_status AS ENUM (
    'active',
    'inactive',
    'suspended'
);

CREATE TYPE ambulance_vehicle_status AS ENUM (
    'available',
    'assigned',
    'unavailable',
    'maintenance'
);

CREATE TYPE ambulance_request_status AS ENUM (
    'requested',
    'accepted',
    'dispatching',
    'dispatched',
    'en_route',
    'arrived',
    'completed',
    'cancelled',
    'failed',
    'manual_follow_up'
);

COMMIT;
