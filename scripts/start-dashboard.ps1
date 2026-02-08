# Start Claude AS Dashboard (PowerShell)

param(
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DashboardDir = Join-Path $ScriptDir ".." "dashboard"

Set-Location $DashboardDir

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    exit 1
}

# Install dependencies if needed
$NodeModulesPath = Join-Path "server" "node_modules"
if (-not (Test-Path $NodeModulesPath)) {
    Write-Host "Installing dependencies..."
    Set-Location server
    npm install express
    Set-Location ..
}

# Start server
Write-Host "Starting Claude AS Dashboard..."
Write-Host "Access at: http://localhost:$Port"
Set-Location server
$env:PORT = $Port
node index.js
