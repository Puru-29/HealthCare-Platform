$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'db-migrate-config.psm1'
Import-Module $modulePath -Force
$runnerPath = Join-Path $PSScriptRoot 'db-migrate.ps1'
$runnerText = Get-Content -LiteralPath $runnerPath -Raw

function Assert-Equal {
    param(
        [Parameter(Mandatory)]$Expected,
        [Parameter(Mandatory)]$Actual,
        [Parameter(Mandatory)][string]$Message
    )
    if ($Expected -cne $Actual) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

function Assert-Throws {
    param(
        [Parameter(Mandatory)][scriptblock]$Action,
        [Parameter(Mandatory)][string]$Message
    )
    try {
        & $Action
    }
    catch {
        return
    }
    throw $Message
}

Assert-Throws {
    Resolve-MigrationTargetDatabase -UseTestDatabase $false -ConfiguredDatabase $null
} 'Migration runner must refuse to proceed without explicit test mode.'
Assert-Throws {
    Resolve-MigrationTargetDatabase -UseTestDatabase $false -ConfiguredDatabase 'healthcare_platform'
} 'Migration runner must refuse healthcare_platform.'
Assert-Throws {
    Resolve-MigrationTargetDatabase -UseTestDatabase $false -ConfiguredDatabase 'healthcare_platform_test'
} 'Migration runner must require explicit test mode.'
Assert-Equal 'healthcare_platform_test' `
    (Resolve-MigrationTargetDatabase -UseTestDatabase $true -ConfiguredDatabase $null) `
    'Test mode must resolve to the exact disposable database.'
Assert-Equal 'healthcare_platform_test' `
    (Resolve-MigrationTargetDatabase -UseTestDatabase $true -ConfiguredDatabase 'healthcare_platform_test') `
    'Test mode must accept the exact configured disposable database.'
Assert-Throws {
    Resolve-MigrationTargetDatabase -UseTestDatabase $true -ConfiguredDatabase 'healthcare_platform'
} 'Test mode must refuse healthcare_platform.'
Assert-Throws {
    Resolve-MigrationTargetDatabase -UseTestDatabase $true -ConfiguredDatabase 'healthcare_platform_other'
} 'Test mode must refuse all other database names.'

function New-TestConnectionSettings {
    param([string]$OverrideName, [string]$OverrideValue)
    $settings = @{
        PGHOSTADDR = $null
        PGSERVICE = $null
        PGSERVICEFILE = $null
        PGTARGETSESSIONATTRS = $null
        PGLOADBALANCEHOSTS = $null
        PGOPTIONS = $null
    }
    if ($OverrideName) {
        $settings[$OverrideName] = $OverrideValue
    }
    return $settings
}

$validConnectionSettings = New-TestConnectionSettings
foreach ($hostName in @('127.0.0.1', 'localhost')) {
    Assert-MigrationTestConnection `
        -UseTestDatabase $true `
        -ResolvedDatabaseName 'healthcare_platform_test' `
        -HostName $hostName `
        -Port '5432' `
        -EnvironmentSettings $validConnectionSettings
}
Assert-Throws {
    Assert-MigrationTestConnection `
        -UseTestDatabase $true `
        -ResolvedDatabaseName 'healthcare_platform_test' `
        -HostName 'db.example.com' `
        -Port '5432' `
        -EnvironmentSettings $validConnectionSettings
} 'Test mode must reject a remote host.'
Assert-Throws {
    Assert-MigrationTestConnection `
        -UseTestDatabase $true `
        -ResolvedDatabaseName 'healthcare_platform_test' `
        -HostName '127.0.0.1' `
        -Port '5433' `
        -EnvironmentSettings $validConnectionSettings
} 'Test mode must reject a non-default port.'
Assert-Throws {
    Assert-MigrationTestConnection `
        -UseTestDatabase $true `
        -ResolvedDatabaseName 'healthcare_platform' `
        -HostName '127.0.0.1' `
        -Port '5432' `
        -EnvironmentSettings $validConnectionSettings
} 'Test mode must reject a non-test database.'
foreach ($settingName in @(
    'PGHOSTADDR',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGTARGETSESSIONATTRS',
    'PGLOADBALANCEHOSTS',
    'PGOPTIONS'
)) {
    $conflictingSettings = New-TestConnectionSettings -OverrideName $settingName -OverrideValue 'conflicting-value'
    Assert-Throws {
        Assert-MigrationTestConnection `
            -UseTestDatabase $true `
            -ResolvedDatabaseName 'healthcare_platform_test' `
            -HostName 'localhost' `
            -Port '5432' `
            -EnvironmentSettings $conflictingSettings
    } "Test mode must reject the conflicting $settingName setting."
}
Assert-Throws {
    Assert-MigrationTestConnection `
        -UseTestDatabase $false `
        -ResolvedDatabaseName 'healthcare_platform' `
        -HostName 'remote-host-preserved' `
        -Port '6543' `
        -EnvironmentSettings (New-TestConnectionSettings -OverrideName 'PGSERVICE' -OverrideValue 'existing-service')
} 'Migration runner must refuse all targets without explicit test mode.'

if ($runnerText -notmatch '(?m)^param\(\[switch\]\$TestDatabase\)') {
    throw 'Migration runner must declare the explicit TestDatabase switch.'
}
if ($runnerText -notmatch 'Resolve-MigrationTargetDatabase[\s\S]*?-UseTestDatabase \(\[bool\]\$TestDatabase\)') {
    throw 'Migration runner must use the guarded target resolver.'
}
if ($runnerText -notmatch 'Migration target database: \$script:ResolvedDatabaseName') {
    throw 'Migration runner must print the selected database name.'
}
if (-not $runnerText.Contains("'-d', `$script:ResolvedDatabaseName") -or
    -not $runnerText.Contains('-d $script:ResolvedDatabaseName')) {
    throw 'Every psql invocation must use the explicitly resolved database target.'
}
if ($runnerText.IndexOf('Assert-MigrationTestConnection') -gt $runnerText.IndexOf('$serverInfo = Invoke-PsqlScalar')) {
    throw 'Test connection settings must be validated before the first database query.'
}
if ($runnerText.IndexOf('current_database()') -gt $runnerText.IndexOf('Invoke-PsqlWithInput -Sql $trackingTableSql')) {
    throw 'The connected database must be checked before the migration ledger is created.'
}

$migration007Start = $runnerText.IndexOf("'007_user_authentication.sql' {")
if ($migration007Start -lt 0) {
    throw 'Migration 007 must have an explicit preflight case.'
}
$migration007End = $runnerText.IndexOf('            default {', $migration007Start)
if ($migration007End -lt $migration007Start) {
    throw 'Migration 007 preflight case must end before the fail-closed default case.'
}
$migration007Preflight = $runnerText.Substring($migration007Start, $migration007End - $migration007Start)
foreach ($requiredCheck in @(
    'user_auth_credentials',
    'user_sessions',
    'user_sessions_user_expiry_idx',
    'n.nspname = ''public''',
    'c.relname = ''users''',
    'a.attname = ''id''',
    't.typname = ''uuid''',
    '002_initial_schema.sql'
)) {
    if (-not $migration007Preflight.Contains($requiredCheck)) {
        throw "Migration 007 preflight must check '$requiredCheck'."
    }
}
if ($runnerText -notmatch 'Assert-UserAuthMigrationPreflight -Result \$migrationObjectsExist') {
    throw 'Migration 007 must fail closed on conflicts, missing dependencies, and unexpected preflight results.'
}
Assert-UserAuthMigrationPreflight -Result 'ready'
foreach ($unsafeResult in @('conflict', 'missing_dependency', 'unexpected')) {
    Assert-Throws {
        Assert-UserAuthMigrationPreflight -Result $unsafeResult
    } "Migration 007 preflight must reject '$unsafeResult'."
}

$environmentNames = @(
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
$initialSnapshot = Save-MigrationEnvironment
try {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, "test-value-$name", 'Process')
    }
    $testSnapshot = Save-MigrationEnvironment
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, "changed-value-$name", 'Process')
    }
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $null, 'Process')

    Restore-MigrationEnvironment -Snapshot $testSnapshot
    foreach ($name in $environmentNames) {
        Assert-Equal "test-value-$name" `
            ([Environment]::GetEnvironmentVariable($name, 'Process')) `
            "Environment restore failed for $name."
    }

    [Environment]::SetEnvironmentVariable('PGUSER', $null, 'Process')
    $missingUserSnapshot = Save-MigrationEnvironment
    [Environment]::SetEnvironmentVariable('PGUSER', 'temporary-user', 'Process')
    Restore-MigrationEnvironment -Snapshot $missingUserSnapshot
    if (Test-Path Env:PGUSER) {
        throw 'Environment restore failed to remove PGUSER when it was originally unset.'
    }
}
finally {
    Restore-MigrationEnvironment -Snapshot $initialSnapshot
}

$priorPsqlFunction = Get-Item Function:\psql -ErrorAction SilentlyContinue
$runnerEnvironmentSnapshot = Save-MigrationEnvironment
$runnerEnvironment = @{
    PGHOST = 'localhost'
    PGPORT = '5432'
    PGDATABASE = 'healthcare_platform_test'
    PGUSER = 'offline-test-role'
    PGPASSWORD = 'offline-test-password'
    PGHOSTADDR = $null
    PGSERVICE = $null
    PGSERVICEFILE = $null
    PGOPTIONS = $null
    PGTARGETSESSIONATTRS = $null
    PGLOADBALANCEHOSTS = $null
}
try {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $runnerEnvironment[$name], 'Process')
    }

    $global:MigrationTestPsqlCalled = $false
    function psql {
        $global:MigrationTestPsqlCalled = $true
        $global:LASTEXITCODE = 1
    }

    Assert-Throws {
        & $runnerPath -TestDatabase
    } 'The mocked initial connection check must fail before any schema changes.'
    if (-not $global:MigrationTestPsqlCalled) {
        throw 'The migration runner did not reach the offline psql stub.'
    }
    foreach ($name in $environmentNames) {
        $actualValue = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($null -eq $runnerEnvironment[$name]) {
            if ($null -ne $actualValue) {
                throw "Runner failure did not restore unset $name."
            }
        }
        else {
            Assert-Equal $runnerEnvironment[$name] $actualValue `
                "Runner failure did not restore $name."
        }
    }
}
finally {
    Remove-Item Function:\psql -ErrorAction SilentlyContinue
    if ($priorPsqlFunction) {
        Set-Item Function:\psql -Value $priorPsqlFunction.Definition
    }
    Remove-Variable MigrationTestPsqlCalled -Scope Global -ErrorAction SilentlyContinue
    Restore-MigrationEnvironment -Snapshot $runnerEnvironmentSnapshot
}

if ($runnerText -notmatch 'finally\s*\{[\s\S]*?Restore-MigrationEnvironment -Snapshot \$originalEnvironment') {
    throw 'Migration runner must restore its original PostgreSQL environment in its finally block.'
}

Write-Output 'Migration target selection and environment restoration tests passed.'
