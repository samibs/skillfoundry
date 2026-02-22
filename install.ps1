# SkillFoundry - Agents & Skills Installer (PowerShell)
# Installs the Claude Code, GitHub Copilot CLI, Cursor, OpenAI Codex, or Google Gemini framework to a target project
# Supports installing MULTIPLE platforms in a single run via comma-separated values.
#
# USAGE:
#   From your project directory:
#   C:\DevLab\IDEA\skillfoundry\install.ps1
#   C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform claude
#   C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform copilot
#   C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform cursor
#   C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform codex
#   C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform "copilot,codex"
#   C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform "claude,copilot,cursor,codex,gemini"
#
# DO NOT copy the skillfoundry folder into your project!
# Keep it in one central location and run the installer from there.

param(
    [string]$Platform = "",
    [string]$TargetDir = ".",
    [switch]$Yes,
    [switch]$DryRun,
    [switch]$Help,
    [switch]$Version,
    [switch]$Debug = $false
)

$ErrorActionPreference = "Stop"

# Error handler
trap {
    $exitCode = $_.Exception.HResult
    if ($exitCode -eq 0) { $exitCode = 1 }
    
    Write-ColorOutput "`n╔═══════════════════════════════════════════════════════════╗" "Red"
    Write-ColorOutput "║                    ERROR OCCURRED                          ║" "Red"
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Red"
    Write-ColorOutput "Error: Installation failed" "Red"
    Write-ColorOutput "  Reason: $($_.Exception.Message)" "Yellow"
    Write-ColorOutput "  Location: $($_.InvocationInfo.ScriptLineNumber)" "Yellow"
    
    # Rollback if partial installation — but NEVER rollback the source framework itself
    $resolvedTarget = if ($TargetDir) { (Resolve-Path $TargetDir -ErrorAction SilentlyContinue).Path } else { $null }
    if ($resolvedTarget -and $resolvedTarget -ne $ScriptDir -and (Test-Path $resolvedTarget)) {
        if ((Test-Path (Join-Path $resolvedTarget ".claude")) -or
            (Test-Path (Join-Path $resolvedTarget ".copilot")) -or
            (Test-Path (Join-Path $resolvedTarget ".cursor")) -or
            (Test-Path (Join-Path $resolvedTarget ".agents")) -or
            (Test-Path (Join-Path $resolvedTarget ".gemini"))) {
            Write-ColorOutput "Rolling back partial installation..." "Yellow"
            Rollback-Installation
        }
    }
    
    # Diagnostic information
    if ($Debug) {
        Collect-Diagnostics
        Write-ColorOutput "Diagnostics saved to: $(Join-Path $TargetDir '.skillfoundry-diagnostics.log')" "Cyan"
    }
    
    exit $exitCode
}

# Rollback function
function Rollback-Installation {
    if (-not $TargetDir) { return }
    
    Write-ColorOutput "Cleaning up partial installation..." "Yellow"
    
    # Remove created directories
    $dirs = @(".claude", ".copilot", ".cursor", ".agents", ".gemini", "genesis")
    foreach ($dir in $dirs) {
        $path = Join-Path $TargetDir $dir
        if (Test-Path $path) {
            Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
            Write-Host "  Removed $dir/"
        }
    }
    
    # Remove created files
    $files = @("CLAUDE.md")
    foreach ($file in $files) {
        $path = Join-Path $TargetDir $file
        if (Test-Path $path) {
            Remove-Item -Force $path -ErrorAction SilentlyContinue
            Write-Host "  Removed $file"
        }
    }
    
    Write-ColorOutput "Rollback complete" "Green"
}

# Diagnostic collection
function Collect-Diagnostics {
    $diagFile = Join-Path $TargetDir ".skillfoundry-diagnostics.log"
    
    $diagnostics = @"
# SkillFoundry Framework - Diagnostic Information
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## System Information
OS: $($env:OS)
Version: [System.Environment]::OSVersion.VersionString
PowerShell Version: $($PSVersionTable.PSVersion)
User: $($env:USERNAME)
Home: $($env:USERPROFILE)

## Framework Information
Framework Version: $((Get-Content (Join-Path $ScriptDir ".version") -ErrorAction SilentlyContinue) -join "")
Framework Path: $ScriptDir
Project Path: $TargetDir

## Disk Space
$(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -like "*$($TargetDir.Substring(0,1))*" } | Format-Table -AutoSize | Out-String)

## Permissions
Project Directory: $(if (Test-Path $TargetDir) { (Get-Acl $TargetDir).AccessToString } else { "N/A" })
Framework Directory: $(if (Test-Path $ScriptDir) { (Get-Acl $ScriptDir).AccessToString } else { "N/A" })

## Environment
PATH: $($env:PATH)
PWD: $(Get-Location)
Platform: $Platform
Debug Mode: $Debug
"@
    
    $diagnostics | Out-File -FilePath $diagFile -Encoding UTF8
}

# Enhanced error logging
function Write-Error-Enhanced {
    param(
        [string]$What,
        [string]$Why,
        [string]$Where,
        [string]$Solution
    )
    
    Write-ColorOutput "`n[ERROR] $What" "Red"
    if ($Why) { Write-ColorOutput "  Reason: $Why" "Yellow" }
    if ($Where) { Write-ColorOutput "  Location: $Where" "Yellow" }
    if ($Solution) { Write-ColorOutput "  Solution: $Solution" "Cyan" }
}

# Colors for output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Get the directory where this script lives
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Read version early
$VersionFilePath = Join-Path $ScriptDir ".version"
if (-not (Test-Path $VersionFilePath)) {
    Write-ColorOutput "Error: .version file not found at $VersionFilePath" "Red"
    exit 1
}
$FrameworkVersion = (Get-Content $VersionFilePath -Raw).Trim()
$FrameworkDate = (Get-Item -Force $VersionFilePath).LastWriteTime.ToString("yyyy-MM-dd")

# Handle -Help
if ($Help) {
    Write-Host "SkillFoundry Framework - Installer v$FrameworkVersion"
    Write-Host ""
    Write-Host "Usage: .\install.ps1 [OPTIONS] [-TargetDir PATH]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Platform PLATFORMS   Comma-separated: claude,copilot,cursor,codex,gemini"
    Write-Host "  -Yes                  Non-interactive mode (accept all defaults)"
    Write-Host "  -DryRun               Show what would be installed without doing it"
    Write-Host "  -Debug                Enable diagnostic logging"
    Write-Host "  -Help                 Show this help message"
    Write-Host "  -Version              Show framework version"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\install.ps1                                    # Interactive install"
    Write-Host "  .\install.ps1 -Platform claude -TargetDir C:\proj # Install Claude"
    Write-Host "  .\install.ps1 -Platform 'claude,cursor' -Yes     # Non-interactive"
    Write-Host "  .\install.ps1 -DryRun -Platform claude           # Preview"
    exit 0
}

# Handle -Version
if ($Version) {
    Write-Host $FrameworkVersion
    exit 0
}

# Timer
$script:TimerStart = Get-Date

function Get-ElapsedSeconds {
    return [int]((Get-Date) - $script:TimerStart).TotalSeconds
}

# Step progress counter
$script:StepCurrent = 0
$script:StepTotal = 0

function Initialize-Steps {
    param([int]$Total)
    $script:StepTotal = $Total
    $script:StepCurrent = 0
}

function Write-Step {
    param([string]$Message)
    $script:StepCurrent++
    Write-Host "  [$($script:StepCurrent)/$($script:StepTotal)] $Message" -ForegroundColor Cyan
}

# What's New from CHANGELOG
function Show-WhatsNew {
    param([string]$ChangelogPath, [string]$Ver)
    if (-not (Test-Path $ChangelogPath)) { return }

    Write-Host ""
    Write-Host "  What's New in v$Ver" -ForegroundColor Cyan
    Write-Host "  $(('─' * 40))" -ForegroundColor Cyan

    $inBlock = $false
    $lineCount = 0
    foreach ($line in Get-Content $ChangelogPath) {
        if ($line -match '^## \[' -and -not $inBlock) {
            $inBlock = $true
            continue
        }
        if ($inBlock) {
            if ($line -match '^## \[' -or $line -match '^---$') { break }
            if ($line -match '^### (.+)') {
                $heading = $Matches[1] -replace ' —.*', ''
                Write-Host "    $heading" -ForegroundColor Yellow
            } elseif ($line -match '^- (.+)' -and $lineCount -lt 10) {
                $bullet = $Matches[1]
                if ($bullet -match '\*\*(.+?)\*\*') {
                    Write-Host "      $($Matches[1])"
                } else {
                    Write-Host "      $bullet"
                }
                $lineCount++
            }
        }
    }
    if ($lineCount -ge 10) {
        Write-Host "      ... see CHANGELOG.md for full details" -ForegroundColor Blue
    }
    Write-Host ""
}

# Convert to absolute path
if (Test-Path $TargetDir) {
    $TargetDir = Resolve-Path $TargetDir
} else {
    Write-Error-Enhanced "Target directory does not exist" "Directory not found" $TargetDir "Create the directory first: New-Item -ItemType Directory -Path $TargetDir"
    exit 4  # File not found
}

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  SkillFoundry Framework — Installer                    │" -ForegroundColor Cyan
Write-Host "  │  v$FrameworkVersion · $FrameworkDate · 5 platforms             │" -ForegroundColor Cyan
Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

# Platform selection if not specified
if ([string]::IsNullOrWhiteSpace($Platform)) {
    if ($Yes) {
        $Platforms = @("claude")
        Write-ColorOutput "  -Yes: defaulting to Claude platform" "Green"
    } else {
        Write-ColorOutput "Select platforms (comma-separated, e.g. 1,5):" "Yellow"
        Write-Host "  1) Claude Code"
        Write-Host "  2) GitHub Copilot CLI"
        Write-Host "  3) Cursor"
        Write-Host "  4) OpenAI Codex"
        Write-Host "  5) Google Gemini"
        Write-Host "  a) All platforms"
        Write-Host ""
        $choice = Read-Host "Choice"

        # Map for number-to-name lookup
        $choiceMap = @{ "1" = "claude"; "2" = "copilot"; "3" = "cursor"; "4" = "codex"; "5" = "gemini" }

        if ($choice -eq "a" -or $choice -eq "A") {
            $Platforms = @("claude", "copilot", "cursor", "codex", "gemini")
        } else {
            $selections = $choice -split ',' | ForEach-Object { $_.Trim() }
            $Platforms = @()
            foreach ($sel in $selections) {
                if ($choiceMap.ContainsKey($sel)) {
                    $Platforms += $choiceMap[$sel]
                } else {
                    Write-ColorOutput "Invalid choice '$sel'. Must be 1-5 or 'a'." "Red"
                    exit 1
                }
            }
            if ($Platforms.Count -eq 0) {
                Write-ColorOutput "No platforms selected. Exiting." "Red"
                exit 1
            }
        }
    }
} else {
    # Parse comma-separated platforms into array
    if ($Platform -match ',') {
        $Platforms = $Platform -split ',' | ForEach-Object { $_.Trim().ToLower() }
    } else {
        $Platforms = @($Platform.ToLower())
    }
}

# Validate each platform
foreach ($p in $Platforms) {
    if ($p -notmatch '^(claude|copilot|cursor|codex|gemini)$') {
        Write-Error-Enhanced "Invalid platform '$p'" "Must be claude, copilot, cursor, codex, or gemini" "install.ps1" "Use -Platform 'claude,codex' (comma-separated for multiple)"
        exit 2  # Invalid arguments
    }
}

# Remove duplicates
$Platforms = $Platforms | Select-Object -Unique

$PlatformDisplay = ($Platforms -join ", ")
Write-ColorOutput "Platform(s): $PlatformDisplay" "Green"
Write-Host ""

# Check if user accidentally copied skillfoundry into their project
if (Test-Path (Join-Path $TargetDir "skillfoundry")) {
    Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Red"
    Write-ColorOutput "║  ERROR: Found 'skillfoundry' folder in target directory!     ║" "Red"
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Red"
    Write-Host ""
    Write-ColorOutput "You should NOT copy the skillfoundry folder into your project." "Yellow"
    Write-Host ""
    Write-Host "The correct workflow is:"
    Write-Host "  1. Keep skillfoundry in a central location (like C:\DevLab\IDEA\)"
    Write-Host "  2. Run this installer FROM that location INTO your project"
    Write-Host ""
    Write-Host "To fix this:"
    Write-ColorOutput "  cd $TargetDir" "Cyan"
    Write-ColorOutput "  Remove-Item -Recurse -Force skillfoundry" "Cyan"
    Write-ColorOutput "$ScriptDir\install.ps1" "Cyan"
    Write-Host ""
    if ($Yes) {
        $response = "y"
        Write-ColorOutput "  -Yes: auto-removing skillfoundry folder" "Green"
    } else {
        $response = Read-Host "Remove skillfoundry folder and continue? (y/N)"
    }
    if ($response -match "^[Yy]$") {
        Remove-Item -Recurse -Force (Join-Path $TargetDir "skillfoundry")
        Write-ColorOutput "Removed skillfoundry folder. Continuing installation..." "Green"
        Write-Host ""
    } else {
        Write-ColorOutput "Installation cancelled." "Red"
        exit 1
    }
}

# Check if installing into the skillfoundry source folder itself
if ($TargetDir -eq $ScriptDir) {
    Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Red"
    Write-ColorOutput "║  ERROR: Cannot install into the source folder itself!     ║" "Red"
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Red"
    Write-Host ""
    Write-Host "You're trying to install into the skillfoundry template folder."
    Write-Host ""
    Write-Host "The correct workflow is:"
    Write-Host "  1. Create or navigate to your PROJECT folder"
    Write-Host "  2. Run this installer from there"
    Write-Host ""
    Write-Host "Example:"
    Write-ColorOutput "  New-Item -ItemType Directory -Path C:\DevLab\MyNewProject" "Cyan"
    Write-ColorOutput "  cd C:\DevLab\MyNewProject" "Cyan"
    Write-ColorOutput "$ScriptDir\install.ps1" "Cyan"
    Write-Host ""
    exit 1
}

Write-ColorOutput "Installing to: $TargetDir" "Yellow"
Write-ColorOutput "Source: $ScriptDir" "Blue"
Write-Host ""

# Check if platform directories already exist (per platform)
foreach ($plat in $Platforms) {
    $existingDir = $null
    $existingLabel = $null
    if ($plat -eq "claude" -and (Test-Path (Join-Path $TargetDir ".claude"))) {
        $existingDir = ".claude"; $existingLabel = "skills"
    } elseif ($plat -eq "copilot" -and (Test-Path (Join-Path $TargetDir ".copilot"))) {
        $existingDir = ".copilot"; $existingLabel = "agents"
    } elseif ($plat -eq "cursor" -and (Test-Path (Join-Path $TargetDir ".cursor"))) {
        $existingDir = ".cursor"; $existingLabel = "rules"
    } elseif ($plat -eq "codex" -and (Test-Path (Join-Path $TargetDir ".agents\skills"))) {
        $existingDir = ".agents/skills"; $existingLabel = "skills"
    } elseif ($plat -eq "gemini" -and (Test-Path (Join-Path $TargetDir ".gemini\skills"))) {
        $existingDir = ".gemini/skills"; $existingLabel = "skills"
    }

    if ($existingDir) {
        Write-ColorOutput "Warning: $existingDir directory already exists (platform: $plat)." "Yellow"
        if ($Yes) {
            Write-ColorOutput "  -Yes: overwriting $existingLabel" "Green"
        } else {
            $response = Read-Host "Overwrite existing $($existingLabel)? (y/N)"
            if ($response -notmatch "^[Yy]$") {
                Write-ColorOutput "Installation cancelled for platform '$plat'." "Red"
                exit 1
            }
        }
    }
}

# ═══════════════════════════════════════════════════════════════
# DRY-RUN: Preview what would be installed, then exit
# ═══════════════════════════════════════════════════════════════
if ($DryRun) {
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Cyan
    Write-Host "  │  Dry Run — No files will be modified               │" -ForegroundColor Cyan
    Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Target:     $TargetDir"
    Write-Host "  Platforms:  $PlatformDisplay"
    Write-Host "  Source:     $ScriptDir"
    Write-Host ""
    Write-Host "  Would install:"
    $agentCount = (Get-ChildItem -Path "$ScriptDir\agents\*.md" -ErrorAction SilentlyContinue).Count
    Write-Host "    agents/               $agentCount shared modules"
    Write-Host "    genesis/TEMPLATE.md   PRD template"
    Write-Host "    docs/                 Security anti-pattern docs"
    Write-Host "    memory_bank/          Knowledge bootstrap"
    Write-Host "    CLAUDE.md             Project instructions"
    foreach ($plat in $Platforms) {
        switch ($plat) {
            "claude" {
                $c = (Get-ChildItem -Path "$ScriptDir\.claude\commands\*.md" -ErrorAction SilentlyContinue).Count
                Write-Host "    .claude/commands/     $c skills"
            }
            "copilot" {
                $c = (Get-ChildItem -Path "$ScriptDir\.copilot\custom-agents\*.md" -ErrorAction SilentlyContinue).Count
                Write-Host "    .copilot/custom-agents/ $c agents"
            }
            "cursor" {
                $c = (Get-ChildItem -Path "$ScriptDir\.cursor\rules\*.md" -ErrorAction SilentlyContinue).Count
                Write-Host "    .cursor/rules/        $c rules"
            }
            "codex" {
                $c = (Get-ChildItem -Path "$ScriptDir\.agents\skills\*\SKILL.md" -ErrorAction SilentlyContinue).Count
                Write-Host "    .agents/skills/       $c skills"
            }
            "gemini" {
                $c = (Get-ChildItem -Path "$ScriptDir\.gemini\skills\*.md" -ErrorAction SilentlyContinue).Count
                Write-Host "    .gemini/skills/       $c skills"
            }
        }
    }
    Write-Host ""
    Write-ColorOutput "  No changes were made." "Yellow"
    exit 0
}

# ═══════════════════════════════════════════════════════════════
# Initialize progress counter
# ═══════════════════════════════════════════════════════════════
Initialize-Steps (3 + $Platforms.Count + 2)

# Create directory structure — shared directories (once)
Write-Step "Creating shared directory structure..."
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "agents") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "genesis") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "docs\stories") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "memory_bank\knowledge") | Out-Null

# Create platform-specific directories
foreach ($plat in $Platforms) {
    if ($plat -eq "claude") {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".claude\commands") | Out-Null
    } elseif ($plat -eq "copilot") {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".copilot\custom-agents") | Out-Null
    } elseif ($plat -eq "codex") {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".agents\skills") | Out-Null
    } elseif ($plat -eq "gemini") {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".gemini\skills") | Out-Null
    } elseif ($plat -eq "cursor") {
        New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".cursor\rules") | Out-Null
    }
}

# Copy skills/agents/rules for each platform
# Track counts per platform for summary
$PlatformCounts = @{}

foreach ($plat in $Platforms) {
    Write-Step "Installing platform: $plat..."
    if ($plat -eq "claude") {
        Copy-Item -Path "$ScriptDir\.claude\commands\*" -Destination "$TargetDir\.claude\commands\" -Recurse -Force
        $count = (Get-ChildItem -Path "$TargetDir\.claude\commands\*.md" -ErrorAction SilentlyContinue).Count
        $PlatformCounts["claude"] = $count
        Write-ColorOutput "  ✓ Claude skills installed ($count skills)" "Green"
    } elseif ($plat -eq "copilot") {
        Copy-Item -Path "$ScriptDir\.copilot\custom-agents\*" -Destination "$TargetDir\.copilot\custom-agents\" -Recurse -Force
        if (Test-Path "$ScriptDir\.copilot\helper.sh") {
            Copy-Item -Path "$ScriptDir\.copilot\helper.sh" -Destination "$TargetDir\.copilot\" -Force
        }
        if (Test-Path "$ScriptDir\.copilot\WORKFLOW-GUIDE.md") {
            Copy-Item -Path "$ScriptDir\.copilot\WORKFLOW-GUIDE.md" -Destination "$TargetDir\.copilot\" -Force
        }
        $count = (Get-ChildItem -Path "$TargetDir\.copilot\custom-agents\*.md" -ErrorAction SilentlyContinue).Count
        $PlatformCounts["copilot"] = $count
        Write-ColorOutput "  ✓ Copilot custom agents installed ($count agents)" "Green"
        Write-ColorOutput "  ✓ Copilot helper and workflow guide installed" "Green"
    } elseif ($plat -eq "codex") {
        Copy-Item -Path "$ScriptDir\.agents\skills\*" -Destination "$TargetDir\.agents\skills\" -Recurse -Force
        Copy-Item -Path "$ScriptDir\AGENTS.md" -Destination "$TargetDir\AGENTS.md" -Force
        $count = (Get-ChildItem -Path "$TargetDir\.agents\skills\*\SKILL.md" -ErrorAction SilentlyContinue).Count
        $PlatformCounts["codex"] = $count
        Write-ColorOutput "  ✓ Codex skills installed ($count skills)" "Green"
        Write-ColorOutput "  ✓ AGENTS.md installed" "Green"
    } elseif ($plat -eq "gemini") {
        Copy-Item -Path "$ScriptDir\.gemini\skills\*" -Destination "$TargetDir\.gemini\skills\" -Recurse -Force
        $count = (Get-ChildItem -Path "$TargetDir\.gemini\skills\*.md" -ErrorAction SilentlyContinue).Count
        $PlatformCounts["gemini"] = $count
        Write-ColorOutput "  ✓ Gemini skills installed ($count skills)" "Green"
    } elseif ($plat -eq "cursor") {
        Copy-Item -Path "$ScriptDir\.cursor\rules\*" -Destination "$TargetDir\.cursor\rules\" -Recurse -Force
        $count = (Get-ChildItem -Path "$TargetDir\.cursor\rules\*.md" -ErrorAction SilentlyContinue).Count
        $PlatformCounts["cursor"] = $count
        Write-ColorOutput "  ✓ Cursor rules installed ($count rules)" "Green"
    }
}

Write-Step "Installing shared agent modules..."
Copy-Item -Path "$ScriptDir\agents\*" -Destination "$TargetDir\agents\" -Recurse -Force
$SharedCount = (Get-ChildItem -Path "$TargetDir\agents\*.md" -ErrorAction SilentlyContinue).Count
Write-ColorOutput "  ✓ Shared agent modules installed ($SharedCount modules)" "Green"

Write-Step "Installing templates and documentation..."

# Copy CLAUDE.md
if (Test-Path (Join-Path $TargetDir "CLAUDE.md")) {
    Write-ColorOutput "  CLAUDE.md already exists." "Yellow"
    if ($Yes) {
        Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination "$TargetDir\CLAUDE.md" -Force
        Write-ColorOutput "  ✓ CLAUDE.md updated (-Yes)" "Green"
    } else {
        $response = Read-Host "  Overwrite? (y/N)"
        if ($response -match "^[Yy]$") {
            Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination "$TargetDir\CLAUDE.md" -Force
            Write-ColorOutput "  ✓ CLAUDE.md updated" "Green"
        } else {
            Write-ColorOutput "  → Keeping existing CLAUDE.md" "Yellow"
        }
    }
} else {
    Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination "$TargetDir\CLAUDE.md" -Force
    Write-ColorOutput "  ✓ CLAUDE.md installed" "Green"
}

# Copy PRD template
Copy-Item -Path "$ScriptDir\genesis\TEMPLATE.md" -Destination "$TargetDir\genesis\" -Force
Write-ColorOutput "  ✓ PRD template installed to genesis/" "Green"

# Copy security anti-pattern documents to docs/
if (-not (Test-Path (Join-Path $TargetDir "docs\ANTI_PATTERNS_BREADTH.md"))) {
    Copy-Item -Path "$ScriptDir\docs\ANTI_PATTERNS_BREADTH.md" -Destination (Join-Path $TargetDir "docs\") -Force
    Write-ColorOutput "  ✓ docs/ANTI_PATTERNS_BREADTH.md installed" "Green"
}

if (-not (Test-Path (Join-Path $TargetDir "docs\ANTI_PATTERNS_DEPTH.md"))) {
    Copy-Item -Path "$ScriptDir\docs\ANTI_PATTERNS_DEPTH.md" -Destination (Join-Path $TargetDir "docs\") -Force
    Write-ColorOutput "  ✓ docs/ANTI_PATTERNS_DEPTH.md installed" "Green"
}

# Copy knowledge bootstrap for memory/harvest system
$BootstrapTarget = Join-Path $TargetDir "memory_bank\knowledge\bootstrap.jsonl"
if (-not (Test-Path $BootstrapTarget)) {
    Copy-Item -Path "$ScriptDir\memory_bank\knowledge\bootstrap.jsonl" -Destination $BootstrapTarget -Force
    Write-ColorOutput "  ✓ memory_bank/knowledge/ initialized with bootstrap" "Green"
}

# Set framework version markers
Write-Step "Registering project..."
foreach ($plat in $Platforms) {
    $platDir = $null
    if ($plat -eq "claude") { $platDir = ".claude" }
    elseif ($plat -eq "copilot") { $platDir = ".copilot" }
    elseif ($plat -eq "codex") { $platDir = ".agents" }
    elseif ($plat -eq "gemini") { $platDir = ".gemini" }
    elseif ($plat -eq "cursor") { $platDir = ".cursor" }

    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir $platDir) | Out-Null
    $FrameworkVersion | Out-File -FilePath (Join-Path $TargetDir "$platDir\.framework-version") -Encoding utf8 -NoNewline
    $FrameworkDate | Out-File -FilePath (Join-Path $TargetDir "$platDir\.framework-updated") -Encoding utf8 -NoNewline
    $plat | Out-File -FilePath (Join-Path $TargetDir "$platDir\.framework-platform") -Encoding utf8 -NoNewline
}
Write-ColorOutput "  ✓ Framework version: v$FrameworkVersion (Platform(s): $PlatformDisplay)" "Green"

$RegistryFile = Join-Path $ScriptDir ".project-registry"
$RegistryContent = @()
if (Test-Path $RegistryFile) {
    $RegistryContent = Get-Content $RegistryFile
}
if ($RegistryContent -notcontains $TargetDir) {
    Add-Content -Path $RegistryFile -Value $TargetDir
}
Write-ColorOutput "  ✓ Registered for framework updates" "Green"

Write-Step "Done!"

$Elapsed = Get-ElapsedSeconds

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │  Installation Complete                              │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  Project:    $TargetDir"
Write-Host "  Version:    v$FrameworkVersion"
Write-Host "  Platforms:  $PlatformDisplay"
Write-Host "  Duration:   ${Elapsed}s"
Write-Host ""
Write-Host "  Installed:"
foreach ($plat in $Platforms) {
    switch ($plat) {
        "claude"  { Write-Host "    .claude/commands/       $($PlatformCounts['claude']) skills" }
        "copilot" { Write-Host "    .copilot/custom-agents/ $($PlatformCounts['copilot']) agents" }
        "codex"   { Write-Host "    .agents/skills/         $($PlatformCounts['codex']) skills" }
        "gemini"  { Write-Host "    .gemini/skills/         $($PlatformCounts['gemini']) skills" }
        "cursor"  { Write-Host "    .cursor/rules/          $($PlatformCounts['cursor']) rules" }
    }
}
Write-Host "    agents/                 $SharedCount shared modules"
Write-Host "    genesis/                PRD template"
Write-Host ""

# Compact Quick Start
Write-Host "  Quick Start:"
Write-Host ""
foreach ($plat in $Platforms) {
    switch ($plat) {
        "claude" {
            Write-Host "    Claude Code:" -ForegroundColor Cyan
            Write-Host "      cd $TargetDir; claude"
            Write-Host "      > /prd `"your feature`"    Create a PRD"
            Write-Host "      > /go                     Implement everything"
            Write-Host ""
        }
        "cursor" {
            Write-Host "    Cursor:" -ForegroundColor Cyan
            Write-Host "      Open project in Cursor — rules auto-load from .cursor/rules/"
            Write-Host "      Create PRDs in genesis/ using genesis/TEMPLATE.md"
            Write-Host ""
        }
        "codex" {
            Write-Host "    OpenAI Codex:" -ForegroundColor Cyan
            Write-Host "      cd $TargetDir; codex"
            Write-Host "      > `$prd `"your feature`"    Create a PRD"
            Write-Host "      > `$go                     Implement everything"
            Write-Host ""
        }
        "gemini" {
            Write-Host "    Google Gemini:" -ForegroundColor Cyan
            Write-Host "      Open Gemini in $TargetDir"
            Write-Host "      Skills available from .gemini/skills/"
            Write-Host ""
        }
        "copilot" {
            Write-Host "    GitHub Copilot CLI:" -ForegroundColor Cyan
            Write-Host "      Create PRDs in genesis/ using genesis/TEMPLATE.md"
            Write-Host "      Invoke agents from .copilot/custom-agents/"
            Write-Host ""
        }
    }
}

Write-Host "  Docs: CLAUDE.md, docs/ANTI_PATTERNS_DEPTH.md" -ForegroundColor Blue
Write-Host ""

# What's New
Show-WhatsNew (Join-Path $ScriptDir "CHANGELOG.md") $FrameworkVersion

# Update instructions
Write-Host "  Updates:  $ScriptDir\update.ps1 $TargetDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Happy building." -ForegroundColor Blue
Write-Host ""
