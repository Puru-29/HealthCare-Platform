$ErrorActionPreference = 'Stop'
$databaseRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $databaseRoot
$envFile = Join-Path $databaseRoot '.env'
$composeFile = Join-Path $databaseRoot 'docker-compose.yml'
Push-Location $repoRoot

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker was not found. Install and start Docker Desktop, then retry.'
    }

    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose v2 is unavailable. Update Docker Desktop and retry.'
    }

    if (-not (Test-Path $envFile)) {
        throw 'Local database/.env is missing. Run: Copy-Item database/.env.example database/.env, then set a local-only password.'
    }

    $passwordLine = Get-Content -LiteralPath $envFile |
        Where-Object { $_ -match '^\s*POSTGRES_PASSWORD\s*=' } |
        Select-Object -First 1
    if (-not $passwordLine -or $passwordLine -match 'replace_with_|^\s*POSTGRES_PASSWORD\s*=\s*$') {
        throw 'Set POSTGRES_PASSWORD to a unique local-only value in .env before starting the database.'
    }

    & docker compose --env-file $envFile -f $composeFile up -d db
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose could not start the local database.'
    }

    Write-Output 'Local PostGIS database started. Run .\database\scripts\db-health.ps1 to verify readiness.'
}
finally {
    Pop-Location
}
