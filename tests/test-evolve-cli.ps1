Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrameworkDir = Split-Path -Parent $ScriptDir
$Evolve = Join-Path $FrameworkDir "scripts/evolve.ps1"

function Fail([string]$Message) {
    Write-Error "[FAIL] $Message"
    exit 1
}

if (-not (Test-Path -LiteralPath $Evolve -PathType Leaf)) {
    Fail "missing script: $Evolve"
}
Write-Host "[PASS] evolve script exists"

try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Evolve debate | Out-Null
} catch {
    Fail "debate failed: $($_.Exception.Message)"
}
Write-Host "[PASS] debate command works"

try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Evolve iterate -AutoFix -MinIterations 1 -MaxIterations 2 | Out-Null
} catch {
    Fail "iterate failed: $($_.Exception.Message)"
}
Write-Host "[PASS] iterate command works"

try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Evolve run -Phases debate,iterate -AutoFix -MinIterations 1 -MaxIterations 2 | Out-Null
} catch {
    Fail "run command failed: $($_.Exception.Message)"
}
Write-Host "[PASS] run command works"
Write-Host "[PASS] test-evolve-cli complete"
