# Start Observability Trace Viewer (PowerShell)

param(
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ObservabilityDir = Join-Path $ScriptDir ".." "observability"

Set-Location $ObservabilityDir

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
}

# Start server
Write-Host "Starting Observability Trace Viewer..."
Write-Host "Access at: http://localhost:$Port"
$env:PORT = $Port
node trace-viewer-server.js
