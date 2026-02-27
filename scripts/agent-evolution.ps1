param(
    [Parameter(Position = 0)]
    [ValidateSet("analyze", "debate", "cycle", "help")]
    [string]$Command = "help",
    [switch]$AutoFix,
    [int]$MinIterations = 1,
    [int]$MaxIterations = 5,
    [int]$TargetCount = 0,
    [string]$RosterFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrameworkDir = Split-Path -Parent $ScriptDir
$SkillsDir = Join-Path $FrameworkDir ".agents/skills"
$CommandsDir = Join-Path $FrameworkDir ".claude/commands"
$CoreRosterFile53 = Join-Path $FrameworkDir "config/core-agents-53.txt"
$CoreRosterFile46 = Join-Path $FrameworkDir "config/core-agents-46.txt"
$CoreRosterFile = $null
$ReportDir = Join-Path $FrameworkDir "logs/agent-evolution"

function Show-Help {
    @"
Agent Evolution Engine (PowerShell)

Usage:
  ./scripts/agent-evolution.ps1 analyze [-TargetCount N] [-RosterFile path]
  ./scripts/agent-evolution.ps1 debate [-TargetCount N] [-RosterFile path]
  ./scripts/agent-evolution.ps1 cycle [-AutoFix] [-MinIterations 1] [-MaxIterations 5] [-TargetCount N] [-RosterFile path]
"@
}

function Resolve-CoreRosterFile {
    if ($RosterFile -and $RosterFile.Trim() -ne "") {
        return $RosterFile
    }
    if (Test-Path -LiteralPath $CoreRosterFile53 -PathType Leaf) {
        return $CoreRosterFile53
    }
    return $CoreRosterFile46
}

function Assert-Layout {
    $script:CoreRosterFile = Resolve-CoreRosterFile
    if (-not (Test-Path -LiteralPath $SkillsDir -PathType Container)) {
        throw "Skills directory missing: $SkillsDir"
    }
    if (-not (Test-Path -LiteralPath $CommandsDir -PathType Container)) {
        throw "Commands directory missing: $CommandsDir"
    }
    if (-not (Test-Path -LiteralPath $CoreRosterFile -PathType Leaf)) {
        throw "Core roster file missing: $CoreRosterFile"
    }
    New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

function Get-CoreRoster {
    Get-Content -LiteralPath $CoreRosterFile |
        ForEach-Object { ($_ -replace "#.*$", "").Trim() } |
        Where-Object { $_ -ne "" } |
        Sort-Object -Unique
}

function Get-SkillNames {
    Get-ChildItem -LiteralPath $SkillsDir -Directory | Select-Object -ExpandProperty Name | Sort-Object -Unique
}

function Get-CommandNames {
    Get-ChildItem -LiteralPath $CommandsDir -File -Filter "*.md" |
        Select-Object -ExpandProperty BaseName |
        Sort-Object -Unique
}

function Get-WeakSkills([string[]]$CoreRoster) {
    $weak = New-Object System.Collections.Generic.List[string]
    foreach ($agent in $CoreRoster) {
        $skillFile = Join-Path $SkillsDir "$agent/SKILL.md"
        if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
            continue
        }
        $content = Get-Content -LiteralPath $skillFile -Raw
        $hasReflection = $content -match "reflection-protocol|self-critique|self critique"
        $hasCollab = $content -match "handoff|collaborat|delegate|peer|review"
        if (-not $hasReflection -or -not $hasCollab) {
            $weak.Add($agent)
        }
    }
    $weak | Sort-Object -Unique
}

function Get-PeerGapSkills([string[]]$CoreRoster) {
    $weak = New-Object System.Collections.Generic.List[string]
    foreach ($agent in $CoreRoster) {
        $skillFile = Join-Path $SkillsDir "$agent/SKILL.md"
        if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
            continue
        }
        $content = Get-Content -LiteralPath $skillFile -Raw
        $hasPeerSignals = $content -match "Peer Improvement Signals|peer reviewers|challenge request|upstream|downstream"
        if (-not $hasPeerSignals) {
            $weak.Add($agent)
        }
    }
    $weak | Sort-Object -Unique
}

function Get-PeerReviewers([string]$Agent, [string[]]$CoreRoster) {
    $idx = [Array]::IndexOf($CoreRoster, $Agent)
    if ($idx -lt 0) {
        return @("unknown", "unknown")
    }
    $prevIdx = if ($idx -eq 0) { $CoreRoster.Count - 1 } else { $idx - 1 }
    $nextIdx = if ($idx -eq ($CoreRoster.Count - 1)) { 0 } else { $idx + 1 }
    return @($CoreRoster[$prevIdx], $CoreRoster[$nextIdx])
}

function Write-ReflectionContract([string]$Agent) {
    $skillFile = Join-Path $SkillsDir "$Agent/SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
        return
    }
    $content = Get-Content -LiteralPath $skillFile -Raw
    $hasReflection = $content -match "reflection-protocol|self-critique|self critique"
    $hasCollab = $content -match "handoff|collaborat|delegate|peer|review"
    $hasContractHeader = $content -match "Continuous Improvement Contract"
    if ($hasReflection -and $hasCollab -and $hasContractHeader) {
        return
    }
    $block = @'

## Continuous Improvement Contract

- Run self-critique before handoff and after implementation updates.
- Log at least one concrete weakness and one concrete mitigation for each substantial change.
- Request peer challenge from a relevant neighboring agent when risk is medium or higher.
- Escalate unresolved architectural conflicts to orchestrator-class agents.
- Reference: agents/_reflection-protocol.md
'@
    Set-Content -LiteralPath $skillFile -Value ($content + $block)
}

function Write-PeerImprovementSignals([string]$Agent, [string[]]$CoreRoster) {
    $skillFile = Join-Path $SkillsDir "$Agent/SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
        return
    }
    $content = Get-Content -LiteralPath $skillFile -Raw
    $hasPeerSignals = $content -match "Peer Improvement Signals|peer reviewers|challenge request|upstream|downstream"
    if ($hasPeerSignals) {
        return
    }
    $reviewers = Get-PeerReviewers -Agent $Agent -CoreRoster $CoreRoster
    $block = @"

## Peer Improvement Signals

- Upstream peer reviewer: $($reviewers[0])
- Downstream peer reviewer: $($reviewers[1])
- Required challenge request: ask both peers to critique one assumption and one failure mode.
- Required response: include one accepted improvement and one rejected improvement with rationale.
"@
    Set-Content -LiteralPath $skillFile -Value ($content + $block)
}

function Write-ResponsibilitiesSection([string]$Agent) {
    $skillFile = Join-Path $SkillsDir "$Agent/SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) { return }
    $content = Get-Content -LiteralPath $skillFile -Raw
    if ($content -match "## Responsibilities") { return }
    $block = @"

## Responsibilities

- Define clear scope boundaries for this agent's tasks.
- Produce deterministic outputs that downstream agents can validate.
- Surface assumptions, risks, and explicit failure signals.
"@
    Set-Content -LiteralPath $skillFile -Value ($content + $block)
}

function Write-WorkflowSection([string]$Agent) {
    $skillFile = Join-Path $SkillsDir "$Agent/SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) { return }
    $content = Get-Content -LiteralPath $skillFile -Raw
    if ($content -match "## Workflow") { return }
    $block = @"

## Workflow

1. Analyze inputs, constraints, and success criteria.
2. Produce implementation artifacts with explicit guardrails.
3. Run self-critique and peer challenge integration.
4. Emit a handoff payload with risks and next actions.
"@
    Set-Content -LiteralPath $skillFile -Value ($content + $block)
}

function Write-InputsSection([string]$Agent) {
    $skillFile = Join-Path $SkillsDir "$Agent/SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) { return }
    $content = Get-Content -LiteralPath $skillFile -Raw
    if ($content -match "## Inputs") { return }
    $block = @"

## Inputs

- Task objective
- Constraints and policies
- Upstream artifacts required for execution
"@
    Set-Content -LiteralPath $skillFile -Value ($content + $block)
}

function Write-OutputsSection([string]$Agent) {
    $skillFile = Join-Path $SkillsDir "$Agent/SKILL.md"
    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) { return }
    $content = Get-Content -LiteralPath $skillFile -Raw
    if ($content -match "## Outputs") { return }
    $block = @"

## Outputs

- Primary deliverable artifact
- Risk and failure report
- Handoff payload for downstream agents
"@
    Set-Content -LiteralPath $skillFile -Value ($content + $block)
}

function New-SkillFile([string]$Agent) {
    $dir = Join-Path $SkillsDir $Agent
    $file = Join-Path $dir "SKILL.md"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $skill = @'
---
name: AGENT_NAME
description: >-
  Use this agent when you need AGENT_NAME responsibilities executed with strict quality gates.
---

You are the AGENT_NAME agent.

## Responsibilities
- Execute your domain tasks with deterministic, testable outputs.
- Validate inputs and reject ambiguous or unsafe requests.
- Emit concise technical artifacts that downstream agents can consume.

## Workflow
1. Analyze scope, assumptions, and hard constraints.
2. Produce implementation-ready outputs with explicit acceptance criteria.
3. Run self-critique against correctness, security, and maintainability.
4. Handoff findings and artifacts to the next agent with failure signals.

## Continuous Improvement Contract
- Run self-critique before handoff and after implementation updates.
- Record one weakness and one improvement action per major task.
- Ask peer agents to challenge risky decisions.
- Reference: agents/_reflection-protocol.md
'@
    $skill = $skill.Replace("AGENT_NAME", $Agent)
    Set-Content -LiteralPath $file -Value $skill
}

function New-CommandFile([string]$Agent) {
    $file = Join-Path $CommandsDir "$Agent.md"
    $content = @"
# /$Agent

## Purpose
Execute the $Agent workflow with production-oriented quality gates.

## Execution Contract
1. Analyze constraints and define deterministic outputs.
2. Produce implementation artifacts with explicit failure handling.
3. Run self-critique and call out risk concentrations.
4. Handoff to peer agents for adversarial validation.

## Required Signals
- Inputs consumed
- Outputs produced
- Risks detected
- Improvement actions
"@
    Set-Content -LiteralPath $file -Value $content
}

function Compare-Sets([string[]]$Left, [string[]]$Right) {
    $rightSet = @{}
    foreach ($x in $Right) { $rightSet[$x] = $true }
    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($x in $Left) {
        if (-not $rightSet.ContainsKey($x)) { $missing.Add($x) }
    }
    $missing | Sort-Object -Unique
}

function Invoke-Debate([int]$Iteration, [string[]]$CoreRoster) {
    $findings = New-Object System.Collections.Generic.List[object]
    foreach ($agent in $CoreRoster) {
        $skillFile = Join-Path $SkillsDir "$agent/SKILL.md"
        $reviewers = Get-PeerReviewers -Agent $agent -CoreRoster $CoreRoster
        if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "high"
                finding = "Missing SKILL.md file"
                action = "Create skill file with self-critique and peer-improvement sections"
            })
            continue
        }
        $content = Get-Content -LiteralPath $skillFile -Raw
        if (-not ($content -match "Continuous Improvement Contract")) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "high"
                finding = "No continuous improvement contract"
                action = "Add explicit self-critique contract"
            })
        }
        if (-not ($content -match "Peer Improvement Signals|peer reviewers|challenge request|upstream|downstream")) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "medium"
                finding = "No peer-improvement signaling"
                action = "Add deterministic peer reviewer links and challenge protocol"
            })
        }
        if (-not ($content -match "## Responsibilities")) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "medium"
                finding = "No responsibilities section"
                action = "Add Responsibilities section with explicit boundaries and outputs"
            })
        }
        if (-not ($content -match "## Workflow")) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "medium"
                finding = "No workflow section"
                action = "Add deterministic workflow section with ordered execution steps"
            })
        }
        if (-not ($content -match "## Inputs")) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "medium"
                finding = "No inputs section"
                action = "Add Inputs section with expected upstream requirements"
            })
        }
        if (-not ($content -match "## Outputs")) {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "medium"
                finding = "No outputs section"
                action = "Add Outputs section with deterministic deliverables"
            })
        }
        if ($content -match "(?im)^\s*(#|//|/\*|\*|-)?\s*(TODO|FIXME|PLACEHOLDER|STUB|HACK|WIP|TEMP)\s*[:\-]") {
            $findings.Add([pscustomobject]@{
                agent = $agent
                reviewers = $reviewers
                severity = "critical"
                finding = "Banned pattern found in skill definition"
                action = "Remove banned tokens and replace with concrete executable guidance"
            })
        }
    }

    $debateObj = [ordered]@{
        iteration = $Iteration
        timestamp_utc = (Get-Date).ToUniversalTime().ToString("s") + "Z"
        open_findings = $findings.Count
        findings = $findings
    }
    $debateJsonPath = Join-Path $ReportDir "debate-iteration-$Iteration.json"
    $debateTxtPath = Join-Path $ReportDir "debate-iteration-$Iteration.txt"
    ($debateObj | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $debateJsonPath

    $lines = @()
    $lines += "Debate Iteration $Iteration"
    $lines += "- Open findings: $($findings.Count)"
    if ($findings.Count -gt 0) {
        $lines += "- Findings:"
        foreach ($f in $findings) {
            $lines += "  - [$($f.severity)] $($f.agent): $($f.finding) | action: $($f.action)"
        }
    } else {
        $lines += "- Findings: none"
    }
    $lines | Set-Content -LiteralPath $debateTxtPath

    return @{
        OpenFindings = $findings.Count
        Findings = @($findings.ToArray())
        JsonPath = $debateJsonPath
        TxtPath = $debateTxtPath
    }
}

function Invoke-Analysis([int]$Iteration) {
    $core = @(Get-CoreRoster)
    $skills = @(Get-SkillNames)
    $commands = @(Get-CommandNames)
    $missingSkills = @(Compare-Sets -Left $core -Right $skills)
    $missingCommands = @(Compare-Sets -Left $core -Right $commands)
    $weakSkills = @(Get-WeakSkills -CoreRoster $core)
    $peerGapSkills = @(Get-PeerGapSkills -CoreRoster $core)
    $debate = Invoke-Debate -Iteration $Iteration -CoreRoster $core

    $stabilized = ($core.Count -eq $TargetCount -and
        $missingSkills.Count -eq 0 -and
        $missingCommands.Count -eq 0 -and
        $weakSkills.Count -eq 0 -and
        $peerGapSkills.Count -eq 0 -and
        $debate.OpenFindings -eq 0)
    $perfectionScore = [Math]::Max(0, 100 - ($debate.OpenFindings * 5))
    $perfectionAchieved = ($stabilized -and $perfectionScore -eq 100)

    $obj = [ordered]@{
        iteration = $Iteration
        target_core_count = $TargetCount
        core_count = $core.Count
        skills_count = $skills.Count
        commands_count = $commands.Count
        system_map = [ordered]@{
            core_roster = $CoreRosterFile
            skills_dir = $SkillsDir
            commands_dir = $CommandsDir
            analysis_time_utc = (Get-Date).ToUniversalTime().ToString("s") + "Z"
        }
        weak_points = [ordered]@{
            missing_core_skills = $missingSkills.Count
            missing_core_commands = $missingCommands.Count
            weak_skill_contracts = $weakSkills.Count
            peer_debate_gaps = $peerGapSkills.Count
            debate_open_findings = $debate.OpenFindings
        }
        risk_areas = [ordered]@{
            count_drift = ($core.Count -ne $TargetCount)
            stabilized = $stabilized
            perfection_score = $perfectionScore
            perfection_achieved = $perfectionAchieved
        }
    }

    $jsonPath = Join-Path $ReportDir "iteration-$Iteration.json"
    $txtPath = Join-Path $ReportDir "iteration-$Iteration.txt"
    ($obj | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $jsonPath

    $lines = @()
    $lines += "Iteration $Iteration"
    $lines += "System Map"
    $lines += "- Core roster file: $CoreRosterFile"
    $lines += "- Skills scanned: $($skills.Count)"
    $lines += "- Commands scanned: $($commands.Count)"
    $lines += "- Target core count: $TargetCount"
    $lines += ""
    $lines += "Weak Points"
    if ($missingSkills.Count -gt 0) {
        $lines += "- Missing core skill definitions:"
        $missingSkills | ForEach-Object { $lines += "  - $_" }
    } else {
        $lines += "- Missing core skill definitions: none"
    }
    if ($missingCommands.Count -gt 0) {
        $lines += "- Missing core command definitions:"
        $missingCommands | ForEach-Object { $lines += "  - $_" }
    } else {
        $lines += "- Missing core command definitions: none"
    }
    if ($weakSkills.Count -gt 0) {
        $lines += "- Weak skill contracts (no reflection/collab hooks):"
        $weakSkills | ForEach-Object { $lines += "  - $_" }
    } else {
        $lines += "- Weak skill contracts: none"
    }
    if ($peerGapSkills.Count -gt 0) {
        $lines += "- Peer debate gaps (no peer signal hooks):"
        $peerGapSkills | ForEach-Object { $lines += "  - $_" }
    } else {
        $lines += "- Peer debate gaps: none"
    }
    $lines += ""
    $lines += "Risk Areas"
    $lines += "- Core count drift: $(if ($core.Count -ne $TargetCount) { "yes" } else { "no" })"
    $lines += "- Debate open findings: $($debate.OpenFindings)"
    $lines += "- Stabilized: $(if ($stabilized) { "true" } else { "false" })"
    $lines += "- Perfection score: $perfectionScore"
    $lines += "- Perfection achieved: $(if ($perfectionAchieved) { "true" } else { "false" })"
    $lines | Set-Content -LiteralPath $txtPath

    [pscustomobject]@{
        Report = $obj
        MissingSkills = $missingSkills
        MissingCommands = $missingCommands
        WeakSkills = $weakSkills
        PeerGapSkills = $peerGapSkills
        Debate = $debate
        JsonPath = $jsonPath
        TxtPath = $txtPath
    }
}

function Invoke-Fixes($AnalysisResult) {
    $changes = 0
    $core = @(Get-CoreRoster)
    foreach ($agent in $AnalysisResult.MissingSkills) {
        if ($AutoFix) {
            New-SkillFile -Agent $agent
            $changes++
        }
    }
    foreach ($agent in $AnalysisResult.MissingCommands) {
        if ($AutoFix) {
            New-CommandFile -Agent $agent
            $changes++
        }
    }
    foreach ($agent in $AnalysisResult.WeakSkills) {
        if ($AutoFix) {
            Write-ReflectionContract -Agent $agent
            $changes++
        }
    }
    foreach ($agent in $AnalysisResult.PeerGapSkills) {
        if ($AutoFix) {
            Write-PeerImprovementSignals -Agent $agent -CoreRoster $core
            $changes++
        }
    }
    foreach ($finding in $AnalysisResult.Debate.Findings) {
        if (-not $AutoFix) {
            continue
        }
        if ($finding.finding -eq "No continuous improvement contract") {
            Write-ReflectionContract -Agent $finding.agent
            $changes++
        }
        if ($finding.finding -eq "No peer-improvement signaling") {
            Write-PeerImprovementSignals -Agent $finding.agent -CoreRoster $core
            $changes++
        }
        if ($finding.finding -eq "No responsibilities section") {
            Write-ResponsibilitiesSection -Agent $finding.agent
            $changes++
        }
        if ($finding.finding -eq "No workflow section") {
            Write-WorkflowSection -Agent $finding.agent
            $changes++
        }
        if ($finding.finding -eq "No inputs section") {
            Write-InputsSection -Agent $finding.agent
            $changes++
        }
        if ($finding.finding -eq "No outputs section") {
            Write-OutputsSection -Agent $finding.agent
            $changes++
        }
    }
    return $changes
}

Assert-Layout
$resolvedCore = @(Get-CoreRoster)
if ($TargetCount -le 0) {
    $TargetCount = $resolvedCore.Count
}

switch ($Command) {
    "help" {
        Show-Help
        exit 0
    }
    "analyze" {
        $result = Invoke-Analysis -Iteration 1
        Get-Content -LiteralPath $result.TxtPath
        ""
        Get-Content -LiteralPath $result.Debate.TxtPath
        ""
        "Report JSON: $($result.JsonPath)"
        "Debate JSON: $($result.Debate.JsonPath)"
    }
    "debate" {
        $core = @(Get-CoreRoster)
        $debate = Invoke-Debate -Iteration 1 -CoreRoster $core
        Get-Content -LiteralPath $debate.TxtPath
        ""
        "Debate JSON: $($debate.JsonPath)"
    }
    "cycle" {
        if ($MinIterations -lt 1) { $MinIterations = 1 }
        if ($MaxIterations -lt $MinIterations) {
            throw "MaxIterations must be >= MinIterations"
        }
        $perfectionSeen = $false
        $perfectionFirstAt = 0
        for ($i = 1; $i -le $MaxIterations; $i++) {
            $result = Invoke-Analysis -Iteration $i
            Write-Host "Iteration $i" -ForegroundColor Cyan
            Get-Content -LiteralPath $result.TxtPath
            ""
            if ($result.Report.risk_areas.perfection_achieved) {
                if (-not $perfectionSeen) {
                    $perfectionSeen = $true
                    $perfectionFirstAt = $i
                }
                if ($i -ge $MinIterations) {
                    Write-Host "Perfection achieved at iteration $i." -ForegroundColor Green
                    exit 0
                }
                Write-Host "Perfection reached at iteration $i, continuing until MinIterations=$MinIterations." -ForegroundColor Green
            }
            if ($AutoFix) {
                $changes = Invoke-Fixes -AnalysisResult $result
                Write-Host "Applied $changes remediation actions." -ForegroundColor Yellow
            } else {
                Write-Host "Auto-fix disabled; no remediations applied." -ForegroundColor Yellow
            }
        }
        if ($perfectionSeen -and $MaxIterations -ge $MinIterations) {
            Write-Host "Completed $MaxIterations iterations; perfection was first reached at iteration $perfectionFirstAt and maintained through iteration $MaxIterations." -ForegroundColor Green
            exit 0
        }
        Write-Error "Reached max iterations ($MaxIterations) without stabilization."
        exit 1
    }
}
