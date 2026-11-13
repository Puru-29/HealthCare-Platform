# Healthcare Platform API

Node.js, Express, TypeScript, and PostgreSQL API for the CarePath frontend. Public hospital endpoints are read-only and restricted to published Sonipat listings. User authentication and admin management use separate cookie sessions. Ambulance dispatch and live vehicle tracking are not integrated.

## Requirements

- Node.js 22.12 or newer and npm
- PostgreSQL 18 with PostGIS enabled in `healthcare_platform_test`
- A local PostgreSQL role permitted to read and manage the directory tables

## Configure on Windows (PowerShell)

From the repository root, create a local backend environment file:

```powershell
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env` locally. Keep `PGDATABASE=healthcare_platform_test`, `PGHOST=127.0.0.1`, `PGPORT=5432`, and `FRONTEND_ORIGIN=http://127.0.0.1:5174`. Set `GOOGLE_CLIENT_ID` to the Google OAuth Web client ID. Development and test mode reject other database targets; the protected `healthcare_platform` database is rejected in all modes. `.env` files are ignored by Git; do not copy credentials into source files, command history, or messages.

The Vite development server proxies the single relative `/api` path to `http://127.0.0.1:3001`; no frontend API URL is needed.

Create an administrator password hash in an interactive terminal. The password is masked while entered; the command prints only the scrypt hash:

```powershell
Set-Location backend
npm install
npm run admin:hash
```

Put the printed `ADMIN_PASSWORD_HASH=...` value into `backend\.env`. Generate a separate random session-signing key and place it in the local environment file:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64url'))"
```

Set that value as `ADMIN_SESSION_SECRET`. Keep it private and do not commit it. The example environment file contains placeholders only. Admin access stays unavailable until all three admin settings are configured with valid values.

## Run and check the API

From the repository root:

```powershell
Set-Location backend
npm run dev
```

The API listens on `http://127.0.0.1:3001` by default. In another PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

A healthy response is `{ "status": "ok", "database": "connected" }`. A failed database check returns `503` without disclosing connection details.

Set `VITE_GOOGLE_CLIENT_ID` in `frontend/.env.local` to the same Google OAuth Web client ID and add the frontend origin to its authorized JavaScript origins in Google Cloud Console. The browser uses Google Identity Services to obtain an ID token; the API verifies the token signature, audience, issuer, expiration, and verified-email claim with `google-auth-library` before creating a CarePath session. Google identities use the normal CarePath session and CSRF cookies. A Google email matching an existing password account is not silently linked; sign in using that existing account instead. Apply migration 008 to `healthcare_platform_test` before using Google sign-in.

Open `http://127.0.0.1:5174/register` to create a user account, then use `/login` and `/dashboard`. User passwords use scrypt, sessions are stored as revocable token hashes, cookies are HTTP-only/SameSite Strict, and state-changing requests require same-origin and CSRF checks. Sign-in is rate-limited. Email verification and password recovery are not available without an email provider. The admin API authentication and verification/publication endpoints remain restricted to configured administrator sessions; the frontend admin dashboard is deferred and `/admin/*` browser routes redirect to the public site. Public endpoints continue to enforce verified/published listing rules. Configure HTTPS in production so cookies use the Secure flag.

## API endpoints

### Public

- `GET /api/health` — verifies the actual database name, loopback server address, and port.
- `GET /api/hospitals` — returns only published Sonipat hospitals, paginated with `limit` (1–100) and `offset` (0–1,000,000). Supports validated `search`, `city=Sonipat`, `facilityType`, and `specialty` filters.
- `GET /api/hospitals/:hospitalId` — returns one published Sonipat hospital by UUID.
- `GET /api/doctors` — returns only currently verified, publicly listed doctors with active public affiliations to verified, published Sonipat hospitals. Supports bounded `search`, `specialty`, `limit`, and `offset` filters.
- `GET /api/insurance/networks` — returns currently valid insurer-sourced network records for verified, published Sonipat hospitals. Supports `search`, `searchField=all|provider|plan|hospital`, `limit`, and `offset`. This directory is not a policy-coverage or eligibility check.

The public hospital endpoints use the existing `hospitals` and `hospital_services` schema, a transaction-read-only connection pool, and a server-side exact-city predicate. Draft/unverified records are never returned by the public routes.

The doctor and insurer directories also use current verified snapshots and publishable hospital records; insurer network results are not evidence of an individual's coverage. Emergency contact options use the same published, currently verified hospital listing API. Device location is not sent to the API. Ambulance dispatch and live vehicle tracking are not integrated. Appointment routes require the application-user session. New appointment requests are not implemented because no provider scheduling integration is connected; cancellation is limited to unconfirmed requests recorded in CarePath.

### User accounts

- `POST /api/auth/register` — create a profile and credential, then open a session.
- `POST /api/auth/login` — authenticate an existing account.
- `GET /api/auth/session` — return the currently authenticated basic profile.
- `PATCH /api/auth/profile` — update the signed-in user's display name and email with origin and CSRF validation.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/appointments` — return appointment metadata linked to the signed-in user; doctor and hospital names are omitted unless currently verified.
- `PATCH /api/appointments/:appointmentId/cancel` — cancel only that user's `requested` appointment, using a guarded database transaction and audit entry. Confirmed visits cannot be cancelled through this endpoint.

These endpoints require migration 007, which adds credential and revocable session tables. No existing profile receives a password or session automatically. Migration 006 is also currently pending in this workspace; the existing source-review admin routes require it. The migration runner processes all pending migrations in order and has been restricted to the explicit local test database. Do not apply migrations without reviewing the test database's migration ledger first.

### Administrator

All endpoints below except login require a valid admin session. Mutating requests also require a CSRF token and the exact configured `FRONTEND_ORIGIN`.

- `POST /api/admin/auth/login`, `GET /api/admin/auth/session`, `POST /api/admin/auth/logout`
- `GET /api/admin/overview` — grouped counts for existing hospitals, ambulance providers, vehicles, and request statuses.
- `GET /api/admin/hospitals` — paginated admin directory, including draft/hidden records. Supports bounded `search`, `listingStatus`, and `verificationStatus` filters.
- `GET /api/admin/hospitals/:hospitalId`
- `POST /api/admin/hospitals`, `PATCH /api/admin/hospitals/:hospitalId`
- `GET /api/admin/ambulance/providers`, `POST /api/admin/ambulance/providers`, `PATCH /api/admin/ambulance/providers/:providerId`
- `GET /api/admin/ambulance/vehicles`, `POST /api/admin/ambulance/vehicles`, `PATCH /api/admin/ambulance/vehicles/:vehicleId`

Hospital management writes only the existing public hospital columns, public specialties in `hospital_services`, and append-only verification records in `hospital_verification_records`. Verification captures a snapshot of the public fields and its declared source. Ambulance management uses the existing provider and vehicle tables. Ambulance requests are summarized by status only; request pickup coordinates and user identifiers are not returned or modified. Admin changes are recorded in `audit_logs` without credentials or clinical data. Records are not physically deleted; publication/provider/vehicle statuses are used for lifecycle management.

General hospital and ambulance administration uses the existing schema. The separate source-observation review workflow below requires migration 006, which must be reviewed and explicitly applied before those routes can operate. The API does not rerun migrations or insert sample data.

## Review the Sonipat PM-JAY CSV (read-only dry run)

The CSV importer is read-only and defaults to `healthcare_platform_test` on `127.0.0.1:5432`. It requires an explicit disposable-database target, rejects conflicting connection environment overrides, and verifies `current_database()`, `inet_server_addr()`, and `inet_server_port()` on the connected session before reading schema or hospital/source-observation data. It requires migrations 001–005. It does not load `backend/.env` and writes no database rows. Its JSON review report defaults to `data/reports/sonipat_hospital_import_dry_run.json`; custom report output must be a direct file inside the canonical `data/reports` directory. The importer rejects symlink/reparse-point redirection in `data` or `data/reports` and creates report files exclusively, so existing files are not overwritten. Node's portable path-based filesystem APIs cannot eliminate a race if another process replaces a checked directory between validation and file open; run the report step in a trusted, non-concurrently-modified workspace. The report contains review metadata only, not source email addresses, phone numbers, nodal-officer names, or complete source payloads.

From the repository root:

```powershell
Set-Location backend
npm run import:sonipat:dry-run -- --database healthcare_platform_test --host 127.0.0.1 --port 5432
npm run test:import
```

Possible hospital matches and name similarities are review-only flags. The report includes auditable manual-review records for the three identified Sonipat entry pairs, initialized as unresolved with the source document/page/entry/ID/name. The unresolved decision template is [data/reports/sonipat_pmjay_manual_review_template.json](../data/reports/sonipat_pmjay_manual_review_template.json); it follows the accepted pair-level decision schema and leaves candidate source details to be reconstructed from the CSV in the generated report. To record a review, place a JSON array in a file directly under `data/reports` and pass it with `--review-decisions`. Each decision must use the exact `reviewId` from a dry-run report and one of `unresolved`, `confirmed_same_facility`, `confirmed_distinct_facilities`, or `source_extraction_error`. Non-unresolved decisions require an evidence reference, reviewer identifier, and ISO timestamp with timezone. Use a non-contact staff identifier for `reviewer`, and keep `evidenceReference` to a concise document/page reference rather than notes or personal data. Example:

```json
[
  {
    "reviewId": "202608041074356704.pdf#entries-23-26",
    "reviewerDecision": "confirmed_distinct_facilities",
    "evidenceReference": "202608041074356704.pdf#page=1",
    "reviewer": "reviewer-01",
    "reviewedAt": "2026-10-29T12:00:00.000Z",
    "proposedNormalizations": {
      "24": "Primary Health Center"
    }
  }
]
```

Run the dry-run again with `--review-decisions manual-review.json` to include the annotations. A proposed normalization is keyed by CSV row number and stored separately from the original source name. Decisions are validated, limited to the defined fields, and matched to current review candidates; they are not persisted by dry-run. Resolved and unresolved entries remain flagged for review: decisions never clear flags or trigger merge, deletion, verification, or publication. The dry-run report does not propose a hospital record or claim an import occurred.

The evidence packet [sonipat_hospital_manual_review_evidence_20261029.json](../data/reports/sonipat_hospital_manual_review_evidence_20261029.json) compares the six source rows side by side and leaves all three pairs unresolved. Its `same_hospital`, `different_hospitals`, and `needs_more_evidence` entries are review options with reasons and PDF/CSV references, not importer decision values or approval to create hospital records. It contains source email addresses and phone numbers as requested for this manual review; handle it as restricted source data. The importer currently accepts only `unresolved`, `confirmed_same_facility`, `confirmed_distinct_facilities`, or `source_extraction_error`; each non-unresolved input requires an evidence reference, reviewer, and timestamp. Decisions remain annotations only and cannot create, merge, verify, or publish hospital records.

### Explicit source-observation write mode

The separate write command is an explicit opt-in and is hard-restricted to the disposable local `healthcare_platform_test` database on loopback port `5432`. It checks the actual database, server address, and server port on the connected session before reading source/hospital tables. The command below **writes source-observation rows** and must only be run when the disposable database is available and the import is separately approved:

```powershell
Set-Location backend
npm run import:sonipat:write -- --write --confirm-write healthcare_platform_test --database healthcare_platform_test --host 127.0.0.1 --port 5432
```

The `--write` flag, matching `--confirm-write` token, and explicit database, host, and port are all mandatory. Without them the importer remains in dry-run mode or rejects the invocation. `PGUSER` and `PGPASSWORD` provide connection credentials; target-related environment overrides must agree with the explicit disposable target, and service/URL overrides are rejected. The script does not load `backend/.env`.

Write mode checks the live schema, requires migration 005's JSONB payload and migration 004's source-identity unique index, and refuses source-observation triggers whose side effects have not been reviewed. It inserts only into `hospital_source_observations`, explicitly sets `hospital_id` to `NULL`, and uses one transaction for the full import. No `hospitals`, verification, publication, or merge records are written. A byte-identical rerun is reported as already imported; a same-identity payload/document conflict aborts and rolls back the transaction. The exact original 17 CSV fields are stored as strings in `source_row_payload`; source document identity is SHA-256 of the PDF bytes.

Rows are eligible only when all 17 source headers exist, CSV parsing and required-field/domain validation pass (including an `unverified` source status), and the referenced PDF is readable from `data/raw`. Ineligible rows are listed with sanitized reasons in the JSON report emitted to stdout. Similar-name pairs, including the six currently flagged rows, remain review-only and unlinked; unresolved decisions are included in the output and do not imply duplicate or distinct facilities. Importer output does not include source email addresses, phone numbers, nodal-officer names, or full payloads; the separate evidence packet documented above is an intentional exception for this manual review. Write mode does not accept `--report`; its result is emitted to stdout.

### Reviewed source-observation draft workflow

The independent admin workflow for source review is exposed at:

- `GET /api/admin/hospitals/source-observations` — lists unlinked observations and their latest pair decision without returning source contacts or the complete CSV payload.
- `POST /api/admin/hospitals/source-reviews/decisions` — records `same_hospital`, `different_hospitals`, or `needs_more_evidence`, along with a reason and evidence reference. Reviewer identity and timestamp come from the authenticated admin session/server.
- `POST /api/admin/hospitals/source-reviews/create-drafts` — creates two unpublished draft hospital records only when the latest decision for that exact pair is `different_hospitals`.

All routes require an admin session; POST routes additionally require the configured origin and CSRF token. The API verifies the actual connected database, server address, and port and refuses this workflow unless they are exactly `healthcare_platform_test`, loopback, and `5432`. Queue reads run in a read-only transaction. Writes use a transaction and roll back on failure. Review text rejects email addresses, Indian mobile-number patterns, and common credential labels to reduce accidental personal-data/secret logging.

Draft creation preserves provenance by linking each original source observation to its draft and storing the source document/page/entry reference. It copies only the original source name into the draft name; it does not copy source contact details or infer public addresses, facility types, services, or locations. It does not merge/delete records or create verification/publication records. Possible duplicate names/references stop creation for separate review. `same_hospital` and unresolved decisions remain unlinked; this workflow does not yet create a single master record for a `same_hospital` decision. The three known similar-name pairs remain unlinked unless separately reviewed, and no records are verified or published.

Migration `006_hospital_source_observation_reviews.sql` must be separately reviewed and approved before applying it to `healthcare_platform_test`. Neither that migration nor these API operations have been executed as part of this implementation. The workflow uses the existing single configured administrator; it does not provide role separation or dual approval. Do not apply migration 006 or invoke the workflow against `healthcare_platform` or a remote database.

### Bulk hospital master-record import

The separate planner reads existing `hospital_source_observations`; it does not recreate or alter those source rows. It produces JSON on stdout with eligible, excluded, potential-duplicate, conflict, unresolved, already-linked, and proposed-draft counts. `excludedObservations` is the distinct union of rows blocked from new creation; unresolved and potential-duplicate counts can overlap for the three unresolved pairs. Reports include source identity/provenance references but omit the full CSV payload and its source contact fields. A proposed hospital uses only the exact original source name, listing status `draft`, and a document/page/entry reference. It does not populate address, contact, coordinates, facility type, services, verification, or publication fields.

Dry-run is the default and requires explicit disposable-database target flags. It opens a read-only transaction, checks the connected database/address/port before each data query, and performs no database writes. Run only after verifying the test database and its migrations:

```powershell
Set-Location backend
npm run hospital-master:dry-run -- --database healthcare_platform_test --host 127.0.0.1 --port 5432
```

Migration 006 is required for this planner: it reads the latest persisted pair decisions to determine whether any manually flagged observation can be released from unresolved status. Migration 004 supplies the source-observation schema and migration 005 supplies the complete source payload needed for identity/payload checks. These migrations must already be applied to `healthcare_platform_test`; this implementation does not apply them.

The three curated pairs (entries 23/26, 44/63, and 59/62 in `202608041074356704.pdf`) remain excluded until a persisted review decision resolves each pair. A `same_hospital` decision is not sufficient for automatic creation because the current review schema has no separately reviewed canonical display name; those rows remain excluded. Similar names and repeated source IDs are flagged for manual review and are never merged. Conflicting identity/payload or existing-link data stops write mode before any inserts. Draft creation re-plans inside a serializable transaction while locking source observations; it inserts one draft, links the original observation, and writes sanitized provenance audit metadata atomically. A rerun recognizes matching draft links and creates nothing again.

Only after the dry-run report is reviewed and write execution is separately approved, the explicit command is:

```powershell
Set-Location backend
npm run hospital-master:write -- --write --confirm-write healthcare_platform_test --database healthcare_platform_test --host 127.0.0.1 --port 5432
```

Both `--write` and the matching confirmation are mandatory. The CLI does not load `backend/.env`; `PGUSER` and `PGPASSWORD` may supply credentials through the process environment. Connection override variables that could redirect the target are rejected. The endpoint is verified on the live connection before each read or write, and a mismatched endpoint is rejected. Do not use the command against `healthcare_platform` or a remote server.

## Validate and test

```powershell
npm run lint
npm run build
npm test
npm run test:hospital-master-import
```

`npm test` includes authorization and validation tests that do not mutate the database. Live integration tests remain read-only and are skipped unless explicitly enabled:

```powershell
$env:RUN_DB_INTEGRATION_TESTS = 'true'
npm run test:integration
Remove-Item Env:RUN_DB_INTEGRATION_TESTS
```
