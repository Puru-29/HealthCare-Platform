# Local PostgreSQL and PostGIS database

The project uses the existing local PostgreSQL server directly; no container is needed for this workflow. Database health checks and migrations are restricted to `healthcare_platform_test` on `127.0.0.1:5432`. The migration runner requires the explicit `-TestDatabase` switch, rejects connection-routing overrides, checks the connected database/address/port before schema changes, and restores connection environment variables when it exits. Never use these scripts against `healthcare_platform`.

## Requirements and connection setup

- PostgreSQL 18 client tools (`psql`) installed and available on `PATH`
- PostgreSQL server running locally with database `healthcare_platform_test`
- PostGIS enabled in that database
- A PostgreSQL role with permission to create the schema objects and migration ledger

From PowerShell at the repository root:

```powershell
Set-Location 'C:\Users\user\Projects\HealthCare-Platform'
$env:Path = 'C:\Program Files\PostgreSQL\18\bin;' + $env:Path # adjust if installed elsewhere
psql --version
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGDATABASE = 'healthcare_platform_test'
$env:PGUSER = Read-Host 'Local PostgreSQL role'
```

Check the connection and installed PostGIS version before migrating:

```powershell
.\database\scripts\db-health.ps1 -TestDatabase
```

The runner also validates the target database, PostgreSQL major version, and PostGIS extension. It stops before migration if application schema objects are present without a migration ledger.

## Apply and verify migrations

```powershell
.\database\scripts\db-migrate.ps1 -TestDatabase
if ($LASTEXITCODE -ne 0) { throw 'Migration runner reported failure.' }
psql -X -v ON_ERROR_STOP=1 -d healthcare_platform_test -c "SELECT version, checksum, applied_at FROM public.schema_migrations ORDER BY version;"
if ($LASTEXITCODE -ne 0) { throw 'Migration ledger verification failed.' }
```

The runner applies SQL files in filename order, records each version and SHA-256 checksum in `public.schema_migrations`, and skips applied migrations only when the checksum matches. Each migration and its tracking row are committed atomically. Editing an applied migration is rejected; create a new numbered migration instead. Never execute these non-idempotent schema migrations manually or repeatedly.

Current migrations:

1. `001_extensions_and_types.sql` installs PostGIS and defines shared enum types.
2. `002_initial_schema.sql` creates the initial tables and constraints.
3. `003_indexes_triggers_and_search.sql` creates indexes, timestamp triggers, and the current hospital verification view.
4. `004_hospital_source_observations.sql` creates append-oriented external source observations, storing document SHA-256 hashes so renamed byte-identical PDFs can be recognized during repeat imports.
5. `005_source_observation_csv_payload.sql` adds an optional, validated JSONB payload for retaining complete original PM-JAY CSV rows; it allows existing observations to remain `NULL`.
6. `006_hospital_source_observation_reviews.sql` records evidence-backed admin review decisions for pairs of source observations; it does not authorize verification or publication.
7. `007_user_authentication.sql` adds password credentials and revocable user sessions; existing user profiles receive no credentials.
8. `008_google_authentication.sql` adds Google identity links without changing existing password credentials or accounts.

Migration 005 supports complete source-payload preservation. The last supplied database baseline contains 76 source observations and 67 draft hospital records; public routes must continue to hide every draft until approved. Migrations 006 through 008 are local implementations and have not been applied by this workflow. No database or importer command is run by the automated offline contract tests:

```powershell
Set-Location 'C:\Users\user\Projects\HealthCare-Platform\backend'
npm run test:source-migration
npm run test:import
```

These are offline contract/helper tests. They do not execute migration SQL or prove PostgreSQL constraint enforcement. The migration runner refuses to run unless `-TestDatabase` is specified and accepts only `healthcare_platform_test`; it passes that database as an explicit `psql -d` target and verifies the actual database, server address, and port before applying migrations.

The test database must already exist and have PostGIS enabled. Migration 001 declares `CREATE EXTENSION IF NOT EXISTS postgis`, but the runner checks for PostGIS before applying migrations, so enable the extension in the disposable database first. Set connection variables for the local PostgreSQL 18 server, then run:

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGUSER = Read-Host 'Local PostgreSQL role'
psql -X -W -d healthcare_platform_test -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis;"
if ($LASTEXITCODE -ne 0) { throw 'PostGIS setup failed for healthcare_platform_test.' }
$env:PGDATABASE = 'healthcare_platform_test'
.\database\scripts\db-migrate.ps1 -TestDatabase
if ($LASTEXITCODE -ne 0) { throw 'Disposable database migrations failed.' }
psql -X -W -d healthcare_platform_test -v ON_ERROR_STOP=1 -f .\database\tests\004_hospital_source_observations.integration.sql
if ($LASTEXITCODE -ne 0) { throw 'Hospital source-observation database constraint checks failed.' }
psql -X -W -d healthcare_platform_test -v ON_ERROR_STOP=1 -c "SELECT version, checksum, applied_at FROM public.schema_migrations ORDER BY version;"
if ($LASTEXITCODE -ne 0) { throw 'Disposable migration ledger verification failed.' }
```

The `-TestDatabase` runner mode accepts only `healthcare_platform_test`, requires `PGHOST` to be `127.0.0.1` or `localhost` and `PGPORT` to be `5432`, and rejects libpq host-address, service-file/service, target-session, load-balancing, and startup-options overrides. If `PGDATABASE` is unset, it resolves directly to the test name; if set, it must already equal that exact name. Both `psql` call paths receive that database explicitly, and the runner checks `current_database()` before creating or changing schema objects. The runner restores the process’s original PostgreSQL connection environment values on exit. After migration 005 is applied, the integration SQL tests migration 004 identity/link constraints and migration 005 `source_row_payload` validation, including a complete 17-string-field payload, rejected invalid payload shapes and values, and SQL `NULL` compatibility. It inserts only temporary test rows and ends with `ROLLBACK`; run it only with the explicit `-d healthcare_platform_test` target. It does not test the PowerShell runner’s failure/rollback path end-to-end.

Before any approved test-database migration, inspect the migration ledger and confirm the target is `healthcare_platform_test`. The runner applies every pending migration in order, not a selected version. From the repository root, use only:

```powershell
.\database\scripts\db-migrate.ps1 -TestDatabase
if ($LASTEXITCODE -ne 0) { throw 'Migration runner reported failure.' }
psql -X -v ON_ERROR_STOP=1 -d healthcare_platform_test -c "SELECT version, checksum, applied_at FROM public.schema_migrations ORDER BY version;"
if ($LASTEXITCODE -ne 0) { throw 'Migration ledger verification failed.' }
```

This command applies any pending migration, not just version 004; inspect the migration folder and ledger before running it. Migration 004 identity is the canonical lowercase ASCII source system + source hospital ID + SHA-256 of exact PDF bytes. The application accepts only ASCII letters/digits plus `.`, `_`, `:`, and `-` for the two identity values, canonicalizes their case to lowercase, and rejects surrounding/interior whitespace and non-ASCII characters. The database requires the stored canonical lowercase form and uses the `C` collation for exact unique-index comparison. Migration 005 adds nullable `source_row_payload`; when populated, the database check requires a JSON object containing all 17 original Sonipat CSV headers with string values. Extra JSON keys are allowed for future source columns. Existing observations can remain null, while future import code must include the complete payload rather than trimming or normalizing its cell values.

The document filename and source date are not part of uniqueness. Renamed byte-identical PDFs with the same source system and ID therefore have one identity. If their source dates or source content differ, the helper reports a conflicting repeat; it must not overwrite the stored observation or silently ignore the conflict. A later genuine snapshot with changed PDF bytes has a distinct hash and can be retained as a separate observation, even if its source ID is unchanged. The database unique index blocks duplicate identity inserts, but a future importer must catch a conflict, load and compare the existing row, and report it rather than using an unconditional upsert or `ON CONFLICT DO NOTHING`. Hashes identify exact bytes, not semantic documents: rescanned, recompressed, or otherwise modified PDFs will have different hashes. Hospital linking is administrative adjudication and is excluded from source-content comparison; the migration does not link or merge hospitals. The table has no database immutability trigger, so future write code must preserve source fields and only change `hospital_id` through an authorized linking operation.

## Reviewed source observations and draft hospital records

The backend contains a separate admin workflow for recording a pair-level decision and, only after the latest decision is `different_hospitals`, creating two draft hospital records. `same_hospital` and `needs_more_evidence` never create or link records. The workflow preserves source observations and links each observation to its resulting draft in the same transaction. A draft copies only the source hospital name and a document/page/entry reference; it does not copy source contacts or invent addresses, services, locations, facility details, verification, or publication data. Drafts remain outside public hospital results.

This workflow requires migration 006. The migration and API changes have not been executed against PostgreSQL as part of their implementation; applying the migration or enabling the workflow requires separate review and explicit approval. The API independently checks `current_database()`, `inet_server_addr()`, and `inet_server_port()` on its connected session and permits source-review reads/writes only on `healthcare_platform_test` through IPv4/IPv6 loopback at port 5432. Source-review queue reads use a read-only transaction; decision and draft operations use transactions and roll back on errors. The review endpoints are available only under authenticated admin routes, and state-changing requests require CSRF validation. The configured admin account is the existing single-administrator model; the workflow does not provide independent dual approval.

## Optional Docker Compose setup

The Compose file and `database/.env.example` are retained for developers who explicitly want an isolated Docker database. That optional setup uses the `postgis/postgis:16-3.5` image, binds to localhost, and is separate from the native PostgreSQL connection above. Do not use the Docker commands when targeting the existing local PostgreSQL 18 server.

## Schema and data boundaries

- The native database connection expects the local server to be started and stopped through the PostgreSQL service/installation; the migration runner never manages server lifecycle.
- Migrations do not seed hospital or doctor records. The last supplied test-database baseline contains 67 draft hospitals; they must remain unpublished until reviewed and approved.
- `users` stores a minimal profile. Migration 007 places scrypt password hashes in `user_auth_credentials` and hashed, revocable session tokens in `user_sessions`; no clinical history is stored there.
- `hospitals` stores public listing fields. `hospital_verification_records` keeps provider/source verification history and separately typed verified values. At most one verification row per hospital may be current. The `current_hospital_verification` view exposes that row, including its status, source, and `last_verified_at`.
- `hospital_services` provides searchable public specialty names and optional, separate verified values and provenance.
- `doctors` has distinct public and provider-verified fields. `doctor_hospital_affiliations` is the many-to-many link between doctors and hospitals.
- `insurance_providers` and `insurance_hospital_networks` describe provider/hospital/plan network membership. They do not store member policy numbers, coverage decisions, or claims.
- `appointments` links a user (optional), doctor, and hospital. The doctor/hospital pair must exist as an affiliation. It stores scheduling metadata only, not clinical details.
- `ambulance_providers` own `ambulance_vehicles`; `ambulance_requests` supports a future dispatch lifecycle, optional provider/vehicle assignment, pickup geography, and an optional destination hospital. Vehicle positions are optional last-known points, not a promise of live tracking.
- `audit_logs` has an optional user actor and a polymorphic target. Its metadata must be sanitized; credentials and health information must not be written there.

## Geographic and directory searches

Hospital and vehicle locations are PostGIS `geography(Point, 4326)` values with GiST indexes. For example, find published facilities within a radius (meters) and sort by distance:

```sql
SELECT
    h.id,
    h.public_name,
    ST_Distance(h.public_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
FROM hospitals AS h
WHERE h.public_listing_status = 'published'
  AND h.public_location IS NOT NULL
  AND ST_DWithin(h.public_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
ORDER BY distance_meters;
```

`$1` is longitude, `$2` is latitude, and `$3` is the radius in meters. To filter by specialty, join `hospital_services` on `hospital_id` and filter `lower(public_specialty_name)`; indexes support that lookup. Provider-verified location can be searched separately through `current_hospital_verification`.
