param(
    [Parameter(Position = 0)]
    [ValidateSet("debate", "implement", "iterate", "run", "help")]
    [string]$Command = "help",
    [switch]$AutoFix,
    [int]$MinIterations = 1,
    [int]$MaxIterations = 10,
    [int]$TargetCount = 0,
    [string]$RosterFile = "",
    [string]$Phases = "debate,implement,iterate"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Engine = Join-Path $ScriptDir "agent-evolution.ps1"

function Show-Help {
    @"
Evolve CLI

Usage:
  ./scripts/evolve.ps1 debate [-TargetCount N] [-RosterFile path]
  ./scripts/evolve.ps1 implement [-AutoFix] [-TargetCount N] [-RosterFile path]
  ./scripts/evolve.ps1 iterate [-AutoFix] [-MinIterations N] [-MaxIterations N] [-TargetCount N] [-RosterFile path]
  ./scripts/evolve.ps1 run [-Phases debate,implement,iterate] [-AutoFix] [-MinIterations N] [-MaxIterations N]

Examples:
  ./scripts/evolve.ps1 debate
  ./scripts/evolve.ps1 implement -AutoFix
  ./scripts/evolve.ps1 iterate -AutoFix -MinIterations 1 -MaxIterations 20
  ./scripts/evolve.ps1 run -Phases debate,iterate -AutoFix -MaxIterations 50
"@
}

function Build-Args([string]$Subcommand) {
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Engine, $Subcommand)
    if ($AutoFix) { $args += "-AutoFix" }
    if ($MinIterations -gt 0) { $args += @("-MinIterations", "$MinIterations") }
    if ($MaxIterations -gt 0) { $args += @("-MaxIterations", "$MaxIterations") }
    if ($TargetCount -gt 0) { $args += @("-TargetCount", "$TargetCount") }
    if ($RosterFile -and $RosterFile.Trim() -ne "") { $args += @("-RosterFile", $RosterFile) }
    return $args
}

function Invoke-Engine([string]$Subcommand) {
    if (-not (Test-Path -LiteralPath $Engine -PathType Leaf)) {
        throw "Engine not found: $Engine"
    }
    $args = Build-Args -Subcommand $Subcommand
    & powershell @args
    if ($LASTEXITCODE -ne 0) {
        throw "Engine command failed: $Subcommand (exit $LASTEXITCODE)"
    }
}

function Invoke-Run {
    $phaseList = $Phases.Split(",") | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ -ne "" }
    if ($phaseList.Count -eq 0) {
        throw "No phases specified"
    }
    foreach ($phase in $phaseList) {
        switch ($phase) {
            "debate" { Invoke-Engine -Subcommand "debate" }
            "implement" {
                if (-not $AutoFix) {
                    Write-Host "implement phase requested without -AutoFix; enabling auto-fix for this phase." -ForegroundColor Yellow
                    $script:AutoFix = $true
                }
                $savedMin = $MinIterations
                $savedMax = $MaxIterations
                $script:MinIterations = 1
                $script:MaxIterations = 2
                Invoke-Engine -Subcommand "cycle"
                $script:MinIterations = $savedMin
                $script:MaxIterations = $savedMax
            }
            "iterate" { Invoke-Engine -Subcommand "cycle" }
            default { throw "Unsupported phase: $phase" }
        }
    }
}

switch ($Command) {
    "help" { Show-Help; exit 0 }
    "debate" { Invoke-Engine -Subcommand "debate" }
    "implement" {
        if (-not $AutoFix) {
            Write-Host "implement without -AutoFix performs no remediations; use -AutoFix for changes." -ForegroundColor Yellow
        }
        $savedMin = $MinIterations
        $savedMax = $MaxIterations
        $MinIterations = 1
        $MaxIterations = 2
        Invoke-Engine -Subcommand "cycle"
        $MinIterations = $savedMin
        $MaxIterations = $savedMax
    }
    "iterate" { Invoke-Engine -Subcommand "cycle" }
    "run" { Invoke-Run }
}
