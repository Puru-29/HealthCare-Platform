param([switch]$TestDatabase)

$ErrorActionPreference = 'Stop'
$databaseRoot = Split-Path -Parent $PSScriptRoot
$migrationDirectory = Join-Path $databaseRoot 'migrations'
Import-Module (Join-Path $PSScriptRoot 'db-migrate-config.psm1') -Force

function ConvertTo-WindowsCommandLineArgument {
    param([Parameter(Mandatory)][string]$Argument)

    $escaped = [regex]::Replace($Argument, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

function Invoke-PsqlWithInput {
    param([Parameter(Mandatory)][string]$Sql)

    $psqlPath = (Get-Command psql -ErrorAction Stop).Source
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $psqlPath
    $arguments = @('-X', '-v', 'ON_ERROR_STOP=1', '-d', $script:ResolvedDatabaseName)
    $startInfo.Arguments = (($arguments | ForEach-Object {
        ConvertTo-WindowsCommandLineArgument -Argument $_
    }) -join ' ')
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Could not start psql to apply the migration.'
    }

    try {
        $inputBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Sql)
        $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
    }
    finally {
        $process.StandardInput.Close()
    }

    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "psql exited with code $($process.ExitCode)."
    }
}

function Invoke-PsqlScalar {
    param([Parameter(Mandatory)][string]$Sql)

    $output = & psql -X -qAt -v ON_ERROR_STOP=1 -d $script:ResolvedDatabaseName -c $Sql
    if ($LASTEXITCODE -ne 0) {
        throw 'A read-only psql check failed. Verify the connection and permissions.'
    }
    return ($output | Out-String).Trim()
}

$originalEnvironment = Save-MigrationEnvironment
$passwordPointer = [IntPtr]::Zero

try {
    if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
        throw 'psql was not found. Add the PostgreSQL 18 bin directory to PATH and retry.'
    }

    $script:ResolvedDatabaseName = Resolve-MigrationTargetDatabase `
        -UseTestDatabase ([bool]$TestDatabase) `
        -ConfiguredDatabase $env:PGDATABASE
    $env:PGDATABASE = $script:ResolvedDatabaseName
    Write-Output "Migration target database: $script:ResolvedDatabaseName"

    if (-not $env:PGHOST) {
        $env:PGHOST = '127.0.0.1'
    }
    if (-not $env:PGPORT) {
        $env:PGPORT = '5432'
    }
    $connectionEnvironment = @{}
    foreach ($name in @(
        'PGHOSTADDR',
        'PGSERVICE',
        'PGSERVICEFILE',
        'PGTARGETSESSIONATTRS',
        'PGLOADBALANCEHOSTS',
        'PGOPTIONS'
    )) {
        $connectionEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    Assert-MigrationTestConnection `
        -UseTestDatabase ([bool]$TestDatabase) `
        -ResolvedDatabaseName $script:ResolvedDatabaseName `
        -HostName $env:PGHOST `
        -Port $env:PGPORT `
        -EnvironmentSettings $connectionEnvironment

    if (-not $env:PGUSER) {
        $env:PGUSER = Read-Host 'Local PostgreSQL role'
    }
    if ([string]::IsNullOrWhiteSpace($env:PGUSER)) {
        throw 'PGUSER is required.'
    }

    if ([string]::IsNullOrEmpty($env:PGPASSWORD)) {
        $securePassword = Read-Host 'Local PostgreSQL password' -AsSecureString
        if ($securePassword.Length -eq 0) {
            throw 'A PostgreSQL password is required.'
        }
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    }

    $migrationFiles = @(Get-ChildItem -LiteralPath $migrationDirectory -Filter '*.sql' -File | Sort-Object Name)
    if ($migrationFiles.Count -eq 0) {
        throw "No SQL migrations found in $migrationDirectory."
    }

    $serverInfo = Invoke-PsqlScalar -Sql @"
SELECT current_database() || '|' ||
       COALESCE(inet_server_addr()::text, '') || '|' ||
       COALESCE(inet_server_port()::text, '') || '|' ||
       current_setting('server_version_num') || '|' ||
       COALESCE((SELECT extversion FROM pg_extension WHERE extname = 'postgis'), '');
"@
    $serverParts = $serverInfo -split '\|', 5
    if ($serverParts.Count -ne 5 -or $serverParts[0] -ne $script:ResolvedDatabaseName) {
        throw "Connected to an unexpected database. Expected '$script:ResolvedDatabaseName'."
    }
    $serverAddressParts = $serverParts[1] -split '/', 2
    $serverAddress = $null
    if (
        -not [System.Net.IPAddress]::TryParse($serverAddressParts[0], [ref]$serverAddress) -or
        -not [System.Net.IPAddress]::IsLoopback($serverAddress) -or
        $serverParts[2] -ne '5432'
    ) {
        throw 'Connected PostgreSQL endpoint is not loopback on port 5432.'
    }
    $serverVersion = [int]$serverParts[3]
    if ($serverVersion -lt 180000 -or $serverVersion -ge 190000) {
        throw "Expected PostgreSQL 18; server_version_num is $($serverParts[1])."
    }
    if ([string]::IsNullOrWhiteSpace($serverParts[4])) {
        throw 'PostGIS is not enabled in the target database. Enable the already-installed extension before migrating.'
    }
    Write-Output "Preflight passed: database $($serverParts[0]), PostgreSQL $($serverVersion), PostGIS $($serverParts[4])."

    $untrackedSchema = Invoke-PsqlScalar -Sql @"
SELECT CASE
    WHEN to_regclass('public.schema_migrations') IS NOT NULL THEN false
    ELSE EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY (ARRAY[
              'users', 'hospitals', 'hospital_verification_records', 'hospital_services',
              'doctors', 'doctor_hospital_affiliations', 'insurance_providers',
              'insurance_hospital_networks', 'appointments', 'ambulance_providers',
              'ambulance_vehicles', 'ambulance_requests', 'audit_logs',
              'current_hospital_verification'
          ])
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
        UNION ALL
        SELECT 1
        FROM pg_type AS t
        JOIN pg_namespace AS n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = ANY (ARRAY[
              'user_account_status', 'hospital_listing_status', 'hospital_verification_status',
              'data_source_type', 'doctor_verification_status', 'affiliation_status',
              'insurance_network_status', 'appointment_status', 'appointment_mode',
              'ambulance_provider_status', 'ambulance_vehicle_status', 'ambulance_request_status'
          ])
        UNION ALL
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
    )
END;
"@
    if ($untrackedSchema -eq 't') {
        throw 'Application schema objects already exist but public.schema_migrations is missing. No migration was applied; reconcile the existing schema before continuing.'
    }

    $trackingTableSql = @'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);
'@
    Invoke-PsqlWithInput -Sql $trackingTableSql

    foreach ($migration in $migrationFiles) {
        if ($migration.Name -notmatch '^\d{3}_[a-z0-9_]+\.sql$') {
            throw "Migration filename '$($migration.Name)' must use the format 001_description.sql."
        }

        $version = $migration.Name
        $checksum = (Get-FileHash -LiteralPath $migration.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $appliedChecksum = Invoke-PsqlScalar -Sql "SELECT checksum FROM public.schema_migrations WHERE version = '$version';"
        if ($appliedChecksum) {
            if ($appliedChecksum -ne $checksum) {
                throw "Applied migration $version has changed. Create a new migration instead of editing an applied file."
            }
            Write-Output "Already applied: $version"
            continue
        }

        $migrationObjectsExist = switch ($version) {
            '001_extensions_and_types.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = ANY (ARRAY[
          'user_account_status', 'hospital_listing_status', 'hospital_verification_status',
          'data_source_type', 'doctor_verification_status', 'affiliation_status',
          'insurance_network_status', 'appointment_status', 'appointment_mode',
          'ambulance_provider_status', 'ambulance_vehicle_status', 'ambulance_request_status'
      ])
);
"@
            }
            '002_initial_schema.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[
          'users', 'hospitals', 'hospital_verification_records', 'hospital_services',
          'doctors', 'doctor_hospital_affiliations', 'insurance_providers',
          'insurance_hospital_networks', 'appointments', 'ambulance_providers',
          'ambulance_vehicles', 'ambulance_requests', 'audit_logs'
      ])
      AND c.relkind IN ('r', 'p')
);
"@
            }
            '003_indexes_triggers_and_search.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT
    EXISTS (
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
    )
    OR EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND (
              (c.relkind = 'v' AND c.relname = 'current_hospital_verification')
              OR (c.relkind = 'i' AND c.relname ~ '(_idx|_gix)$')
          )
    )
    OR EXISTS (
        SELECT 1
        FROM pg_trigger AS t
        JOIN pg_class AS c ON c.oid = t.tgrelid
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND t.tgname LIKE '%_set_updated_at'
          AND NOT t.tgisinternal
    );
"@
            }
            '004_hospital_source_observations.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT CASE
    WHEN EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY (ARRAY[
              'hospital_source_observations',
              'hospital_source_observations_identity_unique_idx',
              'hospital_source_observations_document_hash_idx',
              'hospital_source_observations_hospital_history_idx',
              'hospital_source_observations_unlinked_review_idx'
          ])
    ) THEN 'conflict'
    WHEN NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        JOIN pg_attribute AS a ON a.attrelid = c.oid
        JOIN pg_type AS t ON t.oid = a.atttypid
        WHERE n.nspname = 'public'
          AND c.relname = 'hospitals'
          AND c.relkind IN ('r', 'p')
          AND a.attname = 'id'
          AND NOT a.attisdropped
          AND t.typname = 'uuid'
    ) THEN 'missing_dependency'
    WHEN to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
        THEN 'missing_dependency'
    WHEN NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '001_extensions_and_types.sql'
    )
      OR NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '002_initial_schema.sql'
    )
      OR NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '003_indexes_triggers_and_search.sql'
    ) THEN 'missing_dependency'
    ELSE 'ready'
END;
"@
            }
            '005_source_observation_csv_payload.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT CASE
    WHEN NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'hospital_source_observations'
          AND c.relkind IN ('r', 'p')
    ) THEN 'missing_dependency'
    WHEN EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        JOIN pg_attribute AS a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relname = 'hospital_source_observations'
          AND a.attname = 'source_row_payload'
          AND NOT a.attisdropped
    )
      OR EXISTS (
        SELECT 1
        FROM pg_constraint AS con
        JOIN pg_class AS c ON c.oid = con.conrelid
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'hospital_source_observations'
          AND con.conname = 'hospital_source_observations_source_row_payload_valid'
    ) THEN 'conflict'
    WHEN NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '004_hospital_source_observations.sql'
    ) THEN 'missing_dependency'
    ELSE 'ready'
END;
"@
            }
            '006_hospital_source_observation_reviews.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT CASE
    WHEN EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY (ARRAY[
              'hospital_source_observation_review_decisions',
              'hospital_source_review_decisions_latest_idx',
              'hospital_source_review_decisions_observations_idx'
          ])
    ) THEN 'conflict'
    WHEN NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'hospital_source_observations'
          AND c.relkind IN ('r', 'p')
    ) THEN 'missing_dependency'
    WHEN NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '005_source_observation_csv_payload.sql'
    ) THEN 'missing_dependency'
    ELSE 'ready'
END;
"@
            }
            '007_user_authentication.sql' {
                Invoke-PsqlScalar -Sql @"
SELECT CASE
    WHEN EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY (ARRAY[
              'user_auth_credentials',
              'user_sessions',
              'user_sessions_user_expiry_idx'
          ])
    ) THEN 'conflict'
    WHEN NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        JOIN pg_attribute AS a ON a.attrelid = c.oid
        JOIN pg_type AS t ON t.oid = a.atttypid
        WHERE n.nspname = 'public'
          AND c.relname = 'users'
          AND c.relkind IN ('r', 'p')
          AND a.attname = 'id'
          AND NOT a.attisdropped
          AND t.typname = 'uuid'
    ) THEN 'missing_dependency'
    WHEN NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '002_initial_schema.sql'
    ) THEN 'missing_dependency'
    ELSE 'ready'
END;
"@
            }
            default {
                throw "No preflight object check is defined for migration $version."
            }
        }
        if ($version -eq '004_hospital_source_observations.sql') {
            if ($migrationObjectsExist -eq 'conflict') {
                throw "Migration $version is not tracked, but one or more objects it creates already exist. No migration was run; reconcile the schema and ledger before continuing."
            }
            if ($migrationObjectsExist -ne 'ready') {
                throw "Migration $version prerequisites are not satisfied. Confirm migrations 001-003 are tracked and public.hospitals.id is UUID. No migration was run."
            }
        }
        if ($version -eq '005_source_observation_csv_payload.sql') {
            if ($migrationObjectsExist -eq 'conflict') {
                throw "Migration $version is not tracked, but its source-row payload column or constraint already exists. No migration was run; reconcile the schema and ledger before continuing."
            }
            if ($migrationObjectsExist -ne 'ready') {
                throw "Migration $version prerequisites are not satisfied. Confirm migration 004 is tracked and hospital_source_observations exists. No migration was run."
            }
        }
        if ($version -eq '006_hospital_source_observation_reviews.sql') {
            if ($migrationObjectsExist -eq 'conflict') {
                throw "Migration $version is not tracked, but one or more objects it creates already exist. No migration was run; reconcile the schema and ledger before continuing."
            }
            if ($migrationObjectsExist -ne 'ready') {
                throw "Migration $version prerequisites are not satisfied. Confirm migration 005 is tracked. No migration was run."
            }
        }
        if ($version -eq '007_user_authentication.sql') {
            Assert-UserAuthMigrationPreflight -Result $migrationObjectsExist
        }
        if ($migrationObjectsExist -eq 't') {
            throw "Migration $version is not tracked, but objects it creates already exist. No migration was run; reconcile the schema and ledger before continuing."
        }

        $body = Get-Content -LiteralPath $migration.FullName -Raw
        $body = [regex]::Replace($body, '(?im)^\s*(BEGIN|COMMIT)\s*;\s*(?:\r?\n|$)', '')
        $sql = @"
BEGIN;
$body
INSERT INTO public.schema_migrations (version, checksum) VALUES ('$version', '$checksum');
COMMIT;
"@

        try {
            Invoke-PsqlWithInput -Sql $sql
        }
        catch {
            throw "Migration $version failed: $($_.Exception.Message) The migration transaction was rolled back; inspect psql output before retrying."
        }
        Write-Output "Applied: $version"
    }

    Write-Output 'All local database migrations are applied.'
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($null -ne $originalEnvironment) {
        Restore-MigrationEnvironment -Snapshot $originalEnvironment
    }
}
