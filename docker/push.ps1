# docker/push.ps1 — build images and push to Docker Hub (aipoclab).
#
# Usage (from ANY directory inside the project):
#   .\docker\push.ps1            # pushes :latest
#   .\docker\push.ps1 1.2.0      # pushes :1.2.0 AND :latest
#
# Prerequisites:
#   docker login -u aipoclab   (once — stores credentials in Windows Credential Manager)
#
# Note: the backend image includes LibreOffice — first build takes several minutes.

param(
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$HubOrg        = "aipoclab"
$BackendImage  = "$HubOrg/avatar-backend"
$FrontendImage = "$HubOrg/avatar-frontend"

# PSScriptRoot = directory where this .ps1 lives (docker/)
$EnvFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Error "docker\.env not found.`nCopy docker\.env.example to docker\.env and fill in VITE_GEMINI_API_KEY."
    exit 1
}

# Parse KEY=VALUE lines, skip comments and blank lines
Get-Content $EnvFile | Where-Object { $_ -match '^\s*[^#=\s].*=' } | ForEach-Object {
    $parts = $_ -split '=', 2
    $key   = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
}

if (-not $env:VITE_GEMINI_API_KEY) {
    Write-Error "VITE_GEMINI_API_KEY is not set in docker\.env"
    exit 1
}

# Build from the docker/ directory (where docker-compose.yml lives).
Write-Host "==> Building images (this may take several minutes on first build)..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
    docker compose build
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }

    # Tag a versioned release if requested (:latest already set by compose)
    if ($Tag -ne "latest") {
        Write-Host "==> Tagging :${Tag}..." -ForegroundColor Cyan
        docker tag "${BackendImage}:latest"  "${BackendImage}:${Tag}"
        docker tag "${FrontendImage}:latest" "${FrontendImage}:${Tag}"
    }

    # Push
    Write-Host "==> Pushing to Docker Hub..." -ForegroundColor Cyan
    docker push "${BackendImage}:latest"
    docker push "${FrontendImage}:latest"
    if ($Tag -ne "latest") {
        docker push "${BackendImage}:${Tag}"
        docker push "${FrontendImage}:${Tag}"
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "==> Done." -ForegroundColor Green
Write-Host "    ${BackendImage}:latest"
Write-Host "    ${FrontendImage}:latest"
Write-Host ""
Write-Host "On the Linux server:"
Write-Host "  docker compose pull && docker compose up -d"
