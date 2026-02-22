Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrameworkDir = Split-Path -Parent $ScriptDir
$Engine = Join-Path $FrameworkDir "scripts/agent-evolution.ps1"
$ReportJson = Join-Path $FrameworkDir "logs/agent-evolution/iteration-1.json"
$DebateJson = Join-Path $FrameworkDir "logs/agent-evolution/debate-iteration-1.json"

function Fail([string]$Message) {
    Write-Error "[FAIL] $Message"
    exit 1
}

if (-not (Test-Path -LiteralPath $Engine -PathType Leaf)) {
    Fail "missing script: $Engine"
}
Write-Host "[PASS] script exists"

try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Engine analyze | Out-Null
} catch {
    Fail "analyze command failed: $($_.Exception.Message)"
}
Write-Host "[PASS] analyze command runs"

try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Engine debate | Out-Null
} catch {
    Fail "debate command failed: $($_.Exception.Message)"
}
Write-Host "[PASS] debate command runs"

if (-not (Test-Path -LiteralPath $ReportJson -PathType Leaf)) {
    Fail "missing report: $ReportJson"
}

$obj = Get-Content -LiteralPath $ReportJson -Raw | ConvertFrom-Json
if ($obj.iteration -ne 1) { Fail "report iteration mismatch" }
if (-not $obj.system_map.core_roster) { Fail "missing system map" }
if (-not $obj.weak_points) { Fail "missing weak points" }
if ($null -eq $obj.risk_areas.stabilized) { Fail "missing stabilization flag" }
if ($obj.target_core_count -ne 53) { Fail "expected default target_core_count=53, got $($obj.target_core_count)" }
if ($obj.core_count -ne 53) { Fail "expected core_count=53, got $($obj.core_count)" }
if ($null -eq $obj.weak_points.peer_debate_gaps) { Fail "missing peer_debate_gaps" }
if ($null -eq $obj.weak_points.debate_open_findings) { Fail "missing debate_open_findings" }
if ($null -eq $obj.risk_areas.perfection_score) { Fail "missing perfection_score" }
if ($null -eq $obj.risk_areas.perfection_achieved) { Fail "missing perfection_achieved" }
Write-Host "[PASS] report schema validated"

if (-not (Test-Path -LiteralPath $DebateJson -PathType Leaf)) {
    Fail "missing debate report: $DebateJson"
}
$debate = Get-Content -LiteralPath $DebateJson -Raw | ConvertFrom-Json
if ($debate.iteration -ne 1) { Fail "debate iteration mismatch" }
if ($null -eq $debate.open_findings) { Fail "missing debate open_findings" }
Write-Host "[PASS] debate schema validated"
Write-Host "[PASS] test-agent-evolution complete"
