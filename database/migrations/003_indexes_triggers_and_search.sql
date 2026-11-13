BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER hospitals_set_updated_at
    BEFORE UPDATE ON hospitals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER hospital_services_set_updated_at
    BEFORE UPDATE ON hospital_services
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER doctors_set_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER doctor_hospital_affiliations_set_updated_at
    BEFORE UPDATE ON doctor_hospital_affiliations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER insurance_providers_set_updated_at
    BEFORE UPDATE ON insurance_providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER insurance_hospital_networks_set_updated_at
    BEFORE UPDATE ON insurance_hospital_networks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER appointments_set_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ambulance_providers_set_updated_at
    BEFORE UPDATE ON ambulance_providers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ambulance_vehicles_set_updated_at
    BEFORE UPDATE ON ambulance_vehicles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ambulance_requests_set_updated_at
    BEFORE UPDATE ON ambulance_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX users_active_created_at_idx
    ON users (created_at DESC)
    WHERE account_status = 'active';

CREATE UNIQUE INDEX users_email_lower_unique_idx
    ON users (lower(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX users_phone_unique_idx
    ON users (phone)
    WHERE phone IS NOT NULL;

CREATE INDEX hospitals_public_listing_name_idx
    ON hospitals (lower(public_name))
    WHERE public_listing_status = 'published';

CREATE INDEX hospitals_public_city_listing_idx
    ON hospitals (lower(public_city), public_listing_status)
    WHERE public_city IS NOT NULL;

CREATE INDEX hospitals_public_location_gix
    ON hospitals USING GIST (public_location);

CREATE INDEX hospital_verification_records_hospital_history_idx
    ON hospital_verification_records (hospital_id, created_at DESC);

CREATE UNIQUE INDEX hospital_verification_records_one_current_idx
    ON hospital_verification_records (hospital_id)
    WHERE is_current;

CREATE INDEX hospital_verification_records_status_idx
    ON hospital_verification_records (status, last_verified_at DESC);

CREATE INDEX hospital_verification_records_verified_location_gix
    ON hospital_verification_records USING GIST (verified_location);

CREATE INDEX hospital_services_public_specialty_idx
    ON hospital_services (lower(public_specialty_name), hospital_id)
    WHERE is_publicly_listed;

CREATE INDEX hospital_services_verified_specialty_idx
    ON hospital_services (lower(verified_specialty_name), hospital_id)
    WHERE is_publicly_listed AND verification_status = 'verified';

CREATE UNIQUE INDEX hospital_services_public_specialty_unique_idx
    ON hospital_services (hospital_id, lower(public_specialty_name));

CREATE INDEX doctors_public_specialty_idx
    ON doctors (lower(public_specialty), lower(public_display_name))
    WHERE is_publicly_listed;

CREATE INDEX doctors_verified_specialty_idx
    ON doctors (lower(verified_specialty), lower(verified_display_name))
    WHERE is_publicly_listed AND verification_status = 'verified';

CREATE UNIQUE INDEX doctors_verified_registration_unique_idx
    ON doctors (lower(verified_registration_number))
    WHERE verified_registration_number IS NOT NULL;

CREATE INDEX doctor_hospital_affiliations_hospital_active_idx
    ON doctor_hospital_affiliations (hospital_id, doctor_id)
    WHERE is_publicly_listed AND status = 'active';

CREATE INDEX doctor_hospital_affiliations_doctor_active_idx
    ON doctor_hospital_affiliations (doctor_id, hospital_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX insurance_providers_name_lower_unique_idx
    ON insurance_providers (lower(name));

CREATE INDEX insurance_hospital_networks_hospital_status_idx
    ON insurance_hospital_networks (hospital_id, status);

CREATE INDEX insurance_hospital_networks_provider_plan_idx
    ON insurance_hospital_networks (insurance_provider_id, lower(plan_name));

CREATE INDEX appointments_user_start_idx
    ON appointments (user_id, starts_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX appointments_hospital_start_idx
    ON appointments (hospital_id, starts_at);

CREATE INDEX appointments_doctor_start_idx
    ON appointments (doctor_id, starts_at);

CREATE INDEX appointments_status_start_idx
    ON appointments (status, starts_at);

CREATE INDEX ambulance_providers_active_name_idx
    ON ambulance_providers (lower(name))
    WHERE status = 'active';

CREATE INDEX ambulance_vehicles_provider_status_idx
    ON ambulance_vehicles (ambulance_provider_id, status);

CREATE INDEX ambulance_vehicles_last_known_location_gix
    ON ambulance_vehicles USING GIST (last_known_location);

CREATE INDEX ambulance_requests_pickup_location_gix
    ON ambulance_requests USING GIST (pickup_location);

CREATE INDEX ambulance_requests_status_requested_at_idx
    ON ambulance_requests (status, requested_at);

CREATE INDEX ambulance_requests_provider_status_idx
    ON ambulance_requests (ambulance_provider_id, status)
    WHERE ambulance_provider_id IS NOT NULL;

CREATE INDEX ambulance_requests_user_requested_at_idx
    ON ambulance_requests (requested_by_user_id, requested_at DESC)
    WHERE requested_by_user_id IS NOT NULL;

CREATE UNIQUE INDEX ambulance_requests_external_reference_unique_idx
    ON ambulance_requests (ambulance_provider_id, external_dispatch_reference)
    WHERE external_dispatch_reference IS NOT NULL;

CREATE INDEX audit_logs_actor_created_at_idx
    ON audit_logs (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX audit_logs_entity_created_at_idx
    ON audit_logs (entity_type, entity_id, created_at DESC)
    WHERE entity_id IS NOT NULL;

CREATE INDEX audit_logs_action_created_at_idx
    ON audit_logs (action, created_at DESC);

CREATE VIEW current_hospital_verification AS
SELECT
    hospital_id,
    status,
    source_type,
    source_name,
    source_reference,
    verified_name,
    verified_address,
    verified_city,
    verified_region,
    verified_postal_code,
    verified_phone,
    verified_website,
    verified_facility_type,
    verified_location,
    last_verified_at,
    expires_at
FROM hospital_verification_records
WHERE is_current;

COMMIT;
