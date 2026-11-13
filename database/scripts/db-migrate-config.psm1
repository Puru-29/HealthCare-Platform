$script:PostgresEnvironmentVariables = @(
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGHOSTADDR',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGOPTIONS',
    'PGTARGETSESSIONATTRS',
    'PGLOADBALANCEHOSTS'
)

function Resolve-MigrationTargetDatabase {
    param(
        [Parameter(Mandatory)]
        [bool]$UseTestDatabase,

        [AllowNull()]
        [string]$ConfiguredDatabase
    )

    $testDatabase = 'healthcare_platform_test'

    if (-not $UseTestDatabase) {
        throw "Migrations are restricted to '$testDatabase'; pass -TestDatabase."
    }
    if (-not [string]::IsNullOrEmpty($ConfiguredDatabase) -and
        $ConfiguredDatabase -cne $testDatabase) {
        throw "Test mode refuses PGDATABASE '$ConfiguredDatabase'; set it to '$testDatabase' or leave it unset."
    }
    return $testDatabase
}

function Assert-MigrationTestConnection {
    param(
        [Parameter(Mandatory)]
        [bool]$UseTestDatabase,

        [Parameter(Mandatory)]
        [string]$ResolvedDatabaseName,

        [AllowNull()]
        [string]$HostName,

        [AllowNull()]
        [string]$Port,

        [Parameter(Mandatory)]
        [hashtable]$EnvironmentSettings
    )

    if (-not $UseTestDatabase) {
        throw "Migrations are restricted to 'healthcare_platform_test'."
    }

    if ($ResolvedDatabaseName -cne 'healthcare_platform_test') {
        throw "Test mode requires database 'healthcare_platform_test'."
    }
    if ($HostName -notin @('127.0.0.1', 'localhost')) {
        throw 'Test mode requires PGHOST to be exactly 127.0.0.1 or localhost.'
    }
    if ($Port -cne '5432') {
        throw "Test mode requires PGPORT to be exactly '5432'."
    }

    $routingSettings = @(
        'PGHOSTADDR',
        'PGSERVICE',
        'PGSERVICEFILE',
        'PGTARGETSESSIONATTRS',
        'PGLOADBALANCEHOSTS',
        'PGOPTIONS'
    )
    foreach ($name in $routingSettings) {
        $value = $EnvironmentSettings[$name]
        if (-not [string]::IsNullOrEmpty($value)) {
            throw "Test mode refuses connection override setting $name."
        }
    }
}

function Save-MigrationEnvironment {
    $snapshot = @{}
    foreach ($name in $script:PostgresEnvironmentVariables) {
        $snapshot[$name] = @{
            Exists = Test-Path "Env:$name"
            Value = [Environment]::GetEnvironmentVariable($name, 'Process')
        }
    }
    return $snapshot
}

function Restore-MigrationEnvironment {
    param([Parameter(Mandatory)][hashtable]$Snapshot)

    foreach ($name in $script:PostgresEnvironmentVariables) {
        $entry = $Snapshot[$name]
        if ($entry.Exists) {
            [Environment]::SetEnvironmentVariable($name, $entry.Value, 'Process')
        }
        else {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        }
    }
}

function Assert-UserAuthMigrationPreflight {
    param([Parameter(Mandatory)][string]$Result)

    switch ($Result) {
        'ready' { return }
        'conflict' {
            throw 'Migration 007 is not tracked, but one or more objects it creates already exist. No migration was run; reconcile the schema and ledger before continuing.'
        }
        'missing_dependency' {
            throw 'Migration 007 prerequisites are not satisfied. Confirm migration 002 is tracked and public.users.id is UUID. No migration was run.'
        }
        default {
            throw "Migration 007 preflight returned an unexpected result '$Result'. No migration was run."
        }
    }
}

Export-ModuleMember -Function @(
    'Resolve-MigrationTargetDatabase',
    'Assert-MigrationTestConnection',
    'Save-MigrationEnvironment',
    'Restore-MigrationEnvironment',
    'Assert-UserAuthMigrationPreflight'
)
