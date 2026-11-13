param([switch]$TestDatabase)

$ErrorActionPreference = 'Stop'

if (-not $TestDatabase) {
    throw "Database checks are restricted to healthcare_platform_test; pass -TestDatabase."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw 'psql was not found. Add the PostgreSQL 18 bin directory to PATH and retry.'
}

if (-not $env:PGHOST) {
    $env:PGHOST = '127.0.0.1'
}
if (-not $env:PGPORT) {
    $env:PGPORT = '5432'
}
if (-not $env:PGDATABASE) {
    $env:PGDATABASE = 'healthcare_platform_test'
}
if ($env:PGDATABASE -cne 'healthcare_platform_test') {
    throw 'Refusing to check a database other than healthcare_platform_test.'
}
if ($env:PGHOST -ne '127.0.0.1' -or $env:PGPORT -ne '5432') {
    throw 'Test database checks require PGHOST=127.0.0.1 and PGPORT=5432.'
}
foreach ($name in @(
    'PGHOSTADDR',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGOPTIONS',
    'PGTARGETSESSIONATTRS',
    'PGLOADBALANCEHOSTS'
)) {
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) {
        throw "Test database checks refuse connection override setting $name."
    }
}
if (-not $env:PGUSER) {
    $env:PGUSER = Read-Host 'Local PostgreSQL role'
}
if ([string]::IsNullOrWhiteSpace($env:PGUSER)) {
    throw 'PGUSER is required.'
}

$connectionInfo = & psql -X -qAt -W -v ON_ERROR_STOP=1 -c "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, '') || '|' || COALESCE(inet_server_port()::text, '') || '|' || current_setting('server_version') || '|' || PostGIS_Full_Version();"
if ($LASTEXITCODE -ne 0) {
    throw 'Database connection or PostGIS health check failed.'
}
$parts = ($connectionInfo | Out-String).Trim() -split '\|', 5
$addressParts = if ($parts.Count -ge 2) { $parts[1] -split '/', 2 } else { @('') }
$serverAddress = $null
if (
    $parts.Count -ne 5 -or
    $parts[0] -cne 'healthcare_platform_test' -or
    -not [System.Net.IPAddress]::TryParse($addressParts[0], [ref]$serverAddress) -or
    -not [System.Net.IPAddress]::IsLoopback($serverAddress) -or
    $parts[2] -cne '5432'
) {
    throw 'Connected PostgreSQL endpoint is not the local test database on port 5432.'
}
Write-Output "Target verified: $($parts[0]), PostgreSQL $($parts[3]), PostGIS $($parts[4])."
Write-Output 'PostgreSQL and PostGIS are reachable.'
