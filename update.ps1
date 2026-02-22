# SkillFoundry - Framework Update Script (PowerShell)
# Updates existing projects with the latest framework version
#
# USAGE:
#   .\update.ps1 .                           # Update current directory
#   .\update.ps1 -Project C:\path\to\project # Update single project
#   .\update.ps1 -All                        # Update all registered projects
#   .\update.ps1 -Register .                 # Register current directory
#   .\update.ps1 -Register C:\path\to\project # Register a project
#   .\update.ps1 -Scan C:\path               # Find and register projects
#   .\update.ps1 -List                       # List registered projects
#   .\update.ps1 -Diff C:\path\to\project     # Show what would change

param(
    [string]$Project = "",
    [switch]$All,
    [switch]$Yes,
    [string]$Register = "",
    [string]$Scan = "",
    [switch]$List,
    [string]$Diff = "",
    [switch]$Force,
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
    Write-ColorOutput "Error: Update failed" "Red"
    Write-ColorOutput "  Reason: $($_.Exception.Message)" "Yellow"
    Write-ColorOutput "  Location: $($_.InvocationInfo.ScriptLineNumber)" "Yellow"
    
    # Restore backup if update was partial
    if ($BackupDir -and (Test-Path $BackupDir)) {
        Write-ColorOutput "Restoring from backup..." "Yellow"
        Restore-FromBackup
    }
    
    # Diagnostic information
    if ($Debug) {
        Collect-Diagnostics
        Write-ColorOutput "Diagnostics saved to: $(Join-Path $ScriptDir '.skillfoundry-diagnostics.log')" "Cyan"
    }
    
    exit $exitCode
}

# Restore from backup function
function Restore-FromBackup {
    param([string]$ProjectDir, [string]$BackupPath)
    
    if (-not $BackupPath -or -not (Test-Path $BackupPath)) {
        Write-ColorOutput "No backup found to restore" "Yellow"
        return
    }
    
    Write-ColorOutput "Restoring from backup: $BackupPath" "Yellow"
    
    # Restore platform-specific directories
    $platformDirs = @(".claude", ".copilot", ".cursor", ".agents", ".gemini")
    foreach ($dir in $platformDirs) {
        $targetPath = Join-Path $ProjectDir $dir
        $backupDirPath = Join-Path $BackupPath $dir
        if (Test-Path $backupDirPath) {
            if (Test-Path $targetPath) {
                Remove-Item -Recurse -Force $targetPath
            }
            Copy-Item -Path $backupDirPath -Destination $targetPath -Recurse -Force
            Write-Host "  Restored $dir/"
        }
    }
    
    Write-ColorOutput "Restore complete" "Green"
}

# Diagnostic collection
function Collect-Diagnostics {
    param([string]$ProjectDir = "")
    
    $diagFile = Join-Path $ScriptDir ".skillfoundry-diagnostics.log"
    
    $diagnostics = @"
# SkillFoundry Framework - Update Diagnostic Information
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## System Information
OS: $($env:OS)
PowerShell Version: $($PSVersionTable.PSVersion)
User: $($env:USERNAME)
Computer: $($env:COMPUTERNAME)

## Framework Information
Framework Version: $FrameworkVersion
Framework Path: $ScriptDir
Project Path: $ProjectDir

## Disk Space
$(Get-PSDrive -PSProvider FileSystem | Format-Table -AutoSize | Out-String)

## Permissions
Framework Directory: $(if (Test-Path $ScriptDir) { (Get-Acl $ScriptDir).AccessToString } else { "N/A" })
Project Directory: $(if ($ProjectDir -and (Test-Path $ProjectDir)) { (Get-Acl $ProjectDir).AccessToString } else { "N/A" })

## Update Status
Projects Processed: $(if ($updated) { $updated } else { "N/A" })
Projects Failed: $(if ($failed) { $failed } else { "N/A" })
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
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RegistryFile = Join-Path $ScriptDir ".project-registry"
$VersionFile = Join-Path $ScriptDir ".version"
$ChangelogFile = Join-Path $ScriptDir "CHANGELOG.md"

# Read framework version
if (-not (Test-Path $VersionFile)) {
    Write-Error-Enhanced ".version file not found" "File missing" $VersionFile "Verify framework installation, ensure .version file exists"
    exit 4  # File not found
}
$FrameworkVersion = (Get-Content $VersionFile -Raw).Trim()
$FrameworkDate = (Get-Item -Force $VersionFile).LastWriteTime.ToString("yyyy-MM-dd")

# ═══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

function Print-Header {
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Cyan
    Write-Host "  │  SkillFoundry Framework — Updater                     │" -ForegroundColor Cyan
    Write-Host "  │  v$FrameworkVersion · $FrameworkDate · 5 platforms             │" -ForegroundColor Cyan
    Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Cyan
    Write-Host ""
}

# Timer
$script:TimerStart = $null

function Start-Timer {
    $script:TimerStart = Get-Date
}

function Get-ElapsedSeconds {
    if ($script:TimerStart) {
        return [int]((Get-Date) - $script:TimerStart).TotalSeconds
    }
    return 0
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

function Get-ProjectVersion {
    param([string]$ProjectDir)
    
    $versionFile = $null
    if (Test-Path (Join-Path $ProjectDir ".claude\.framework-version")) {
        $versionFile = Join-Path $ProjectDir ".claude\.framework-version"
    } elseif (Test-Path (Join-Path $ProjectDir ".copilot\.framework-version")) {
        $versionFile = Join-Path $ProjectDir ".copilot\.framework-version"
    } elseif (Test-Path (Join-Path $ProjectDir ".cursor\.framework-version")) {
        $versionFile = Join-Path $ProjectDir ".cursor\.framework-version"
    } elseif (Test-Path (Join-Path $ProjectDir ".agents\.framework-version")) {
        $versionFile = Join-Path $ProjectDir ".agents\.framework-version"
    } elseif (Test-Path (Join-Path $ProjectDir ".gemini\.framework-version")) {
        $versionFile = Join-Path $ProjectDir ".gemini\.framework-version"
    }
    
    if ($versionFile -and (Test-Path $versionFile)) {
        return (Get-Content $versionFile -Raw).Trim()
    }
    return "0.0.0"
}

function Set-ProjectVersion {
    param([string]$ProjectDir)

    $platforms = Detect-Platform $ProjectDir

    # Map platform names to their directory names
    $platformDirMap = @{
        "claude"  = ".claude"
        "copilot" = ".copilot"
        "cursor"  = ".cursor"
        "codex"   = ".agents"
        "gemini"  = ".gemini"
    }

    if ($platforms.Count -eq 0) {
        # Default to .claude if no platform detected
        New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir ".claude") | Out-Null
        $FrameworkVersion | Out-File -FilePath (Join-Path $ProjectDir ".claude\.framework-version") -Encoding utf8 -NoNewline
        $FrameworkDate | Out-File -FilePath (Join-Path $ProjectDir ".claude\.framework-updated") -Encoding utf8 -NoNewline
        return
    }

    foreach ($plat in $platforms) {
        $dirName = $platformDirMap[$plat]
        if ($dirName) {
            New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir $dirName) | Out-Null
            $FrameworkVersion | Out-File -FilePath (Join-Path $ProjectDir "$dirName\.framework-version") -Encoding utf8 -NoNewline
            $FrameworkDate | Out-File -FilePath (Join-Path $ProjectDir "$dirName\.framework-updated") -Encoding utf8 -NoNewline
        }
    }
}

function Detect-Platform {
    param([string]$ProjectDir)

    $platforms = @()

    if (Test-Path (Join-Path $ProjectDir ".claude\commands")) {
        $platforms += "claude"
    }
    if (Test-Path (Join-Path $ProjectDir ".copilot\custom-agents")) {
        $platforms += "copilot"
    }
    if (Test-Path (Join-Path $ProjectDir ".cursor\rules")) {
        $platforms += "cursor"
    }
    if (Test-Path (Join-Path $ProjectDir ".agents\skills")) {
        $platforms += "codex"
    }
    if (Test-Path (Join-Path $ProjectDir ".gemini\skills")) {
        $platforms += "gemini"
    }

    return ,$platforms
}

function Test-ValidProject {
    param([string]$ProjectDir)
    
    return (Test-Path (Join-Path $ProjectDir ".claude")) -or
           (Test-Path (Join-Path $ProjectDir ".copilot")) -or
           (Test-Path (Join-Path $ProjectDir ".cursor")) -or
           (Test-Path (Join-Path $ProjectDir ".agents\skills")) -or
           (Test-Path (Join-Path $ProjectDir ".gemini\skills")) -or
           (Test-Path (Join-Path $ProjectDir "CLAUDE.md"))
}

function Backup-File {
    param([string]$FilePath)
    
    if (Test-Path $FilePath) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backup = "$FilePath.backup.$timestamp"
        Copy-Item -Path $FilePath -Destination $backup -Force
        return $backup
    }
    return $null
}

# ═══════════════════════════════════════════════════════════════
# REGISTRY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

function Register-Project {
    param([string]$ProjectDir)
    
    if ($ProjectDir -eq ".") {
        $ProjectDir = (Get-Location).Path
    } else {
        $ProjectDir = Resolve-Path $ProjectDir
    }
    
    if (-not (Test-ValidProject $ProjectDir)) {
        Write-ColorOutput "Error: '$ProjectDir' is not a SkillFoundry project." "Red"
        Write-Host "Run install.ps1 first to set up the framework."
        exit 1
    }
    
    $registryContent = @()
    if (Test-Path $RegistryFile) {
        $registryContent = Get-Content $RegistryFile
    }
    
    if ($registryContent -contains $ProjectDir) {
        Write-ColorOutput "Project already registered: $ProjectDir" "Yellow"
        return
    }
    
    Add-Content -Path $RegistryFile -Value $ProjectDir
    Write-ColorOutput "Registered: $ProjectDir" "Green"
}

function Get-RegisteredProjects {
    if (-not (Test-Path $RegistryFile)) {
        return @()
    }
    return Get-Content $RegistryFile | Where-Object { $_ -and $_.Trim() }
}

function Show-ProjectList {
    Write-ColorOutput "Registered Projects:" "Blue"
    Write-Host ""
    
    $projects = Get-RegisteredProjects
    if ($projects.Count -eq 0) {
        Write-ColorOutput "  No projects registered." "Yellow"
        Write-Host ""
        Write-Host "Register a project with:"
        Write-ColorOutput "  .\update.ps1 -Register C:\path\to\project" "Cyan"
        Write-ColorOutput "  .\update.ps1 -Register ." "Cyan"
        Write-Host ""
        return
    }
    
    $count = 0
    foreach ($projectDir in $projects) {
        $count++
        $version = Get-ProjectVersion $projectDir
        $status = ""

        if (-not (Test-Path $projectDir)) {
            $status = "[NOT FOUND]"
            Write-ColorOutput "  $count. $projectDir $status" "Red"
        } elseif ($version -eq $FrameworkVersion) {
            $status = "[UP TO DATE]"
            Write-ColorOutput "  $count. $projectDir $status" "Green"
            $detectedPlatforms = Detect-Platform $projectDir
            if ($detectedPlatforms.Count -gt 0) {
                Write-ColorOutput "     Platforms: $($detectedPlatforms -join ', ')" "Blue"
            }
        } else {
            $status = "[v$version -> v$FrameworkVersion]"
            Write-ColorOutput "  $count. $projectDir $status" "Yellow"
            $detectedPlatforms = Detect-Platform $projectDir
            if ($detectedPlatforms.Count -gt 0) {
                Write-ColorOutput "     Platforms: $($detectedPlatforms -join ', ')" "Blue"
            }
        }
    }
    
    Write-Host ""
    Write-ColorOutput "Framework version: $FrameworkVersion" "Cyan"
}

# ═══════════════════════════════════════════════════════════════
# UPDATE FUNCTION
# ═══════════════════════════════════════════════════════════════

function Update-Project {
    param(
        [string]$ProjectDir,
        [bool]$ForceUpdate = $false
    )
    
    if ($ProjectDir -eq ".") {
        $ProjectDir = (Get-Location).Path
    } elseif (-not (Test-Path $ProjectDir)) {
        Write-ColorOutput "Error: Directory not found: $ProjectDir" "Red"
        return $false
    } else {
        $ProjectDir = Resolve-Path $ProjectDir
    }
    
    if (-not (Test-ValidProject $ProjectDir)) {
        Write-Error-Enhanced "Not a SkillFoundry project" "Project directory missing framework markers" $ProjectDir "Run install.ps1 first to set up the framework"
        return $false
    }
    
    $currentVersion = Get-ProjectVersion $ProjectDir
    
    if ($currentVersion -eq $FrameworkVersion -and -not $ForceUpdate) {
        Write-ColorOutput "Project is already up to date (v$currentVersion)" "Green"
        return $true
    }
    
    Start-Timer

    Write-ColorOutput "Updating: $ProjectDir" "Blue"
    Write-ColorOutput "  Current: v$currentVersion → Target: v$FrameworkVersion" "Blue"
    Write-Host ""
    
    # Create backup directory
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupDir = Join-Path $ProjectDir ".claude\backups\$timestamp"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    # Detect all platforms present in this project
    $platforms = Detect-Platform $ProjectDir

    if ($platforms.Count -eq 0) {
        Write-ColorOutput "No platform detected in $ProjectDir" "Yellow"
        return $false
    }

    Write-ColorOutput "Detected platforms: $($platforms -join ', ')" "Cyan"
    Write-Host ""

    # ── Per-platform updates (loop) ──────────────────────────────
    foreach ($plat in $platforms) {
        Write-ColorOutput "Updating platform: $plat" "Blue"

        switch ($plat) {
            "claude" {
                New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir ".claude\commands") | Out-Null
                $skillsAdded = 0
                $skillsUpdated = 0

                foreach ($skill in Get-ChildItem -Path "$ScriptDir\.claude\commands\*.md") {
                    $skillName = $skill.Name
                    $target = Join-Path $ProjectDir ".claude\commands\$skillName"

                    if (-not (Test-Path $target)) {
                        Copy-Item -Path $skill.FullName -Destination $target -Force
                        Write-ColorOutput "  + Added: $skillName" "Green"
                        $skillsAdded++
                    } else {
                        $sourceContent = Get-FileHash $skill.FullName -Algorithm MD5
                        $targetContent = Get-FileHash $target -Algorithm MD5
                        if ($sourceContent.Hash -ne $targetContent.Hash) {
                            Backup-File $target | Out-Null
                            Copy-Item -Path $skill.FullName -Destination $target -Force
                            Write-ColorOutput "  ^ Updated: $skillName" "Cyan"
                            $skillsUpdated++
                        }
                    }
                }

                if ($skillsAdded -eq 0 -and $skillsUpdated -eq 0) {
                    Write-ColorOutput "  All skills up to date" "Green"
                } else {
                    Write-ColorOutput "  $skillsAdded added, $skillsUpdated updated" "Green"
                }
            }
            "copilot" {
                New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir ".copilot\custom-agents") | Out-Null
                $agentsAdded = 0
                $agentsUpdated = 0

                foreach ($agent in Get-ChildItem -Path "$ScriptDir\.copilot\custom-agents\*.md") {
                    $agentName = $agent.Name
                    $target = Join-Path $ProjectDir ".copilot\custom-agents\$agentName"

                    if (-not (Test-Path $target)) {
                        Copy-Item -Path $agent.FullName -Destination $target -Force
                        Write-ColorOutput "  + Added: $agentName" "Green"
                        $agentsAdded++
                    } else {
                        $sourceContent = Get-FileHash $agent.FullName -Algorithm MD5
                        $targetContent = Get-FileHash $target -Algorithm MD5
                        if ($sourceContent.Hash -ne $targetContent.Hash) {
                            Backup-File $target | Out-Null
                            Copy-Item -Path $agent.FullName -Destination $target -Force
                            Write-ColorOutput "  ^ Updated: $agentName" "Cyan"
                            $agentsUpdated++
                        }
                    }
                }

                # Update helper and guides
                if (Test-Path "$ScriptDir\.copilot\helper.sh") {
                    Copy-Item -Path "$ScriptDir\.copilot\helper.sh" -Destination "$ProjectDir\.copilot\" -Force
                }
                if (Test-Path "$ScriptDir\.copilot\WORKFLOW-GUIDE.md") {
                    Copy-Item -Path "$ScriptDir\.copilot\WORKFLOW-GUIDE.md" -Destination "$ProjectDir\.copilot\" -Force
                }

                if ($agentsAdded -eq 0 -and $agentsUpdated -eq 0) {
                    Write-ColorOutput "  All agents up to date" "Green"
                } else {
                    Write-ColorOutput "  $agentsAdded added, $agentsUpdated updated" "Green"
                }
            }
            "cursor" {
                New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir ".cursor\rules") | Out-Null
                $rulesAdded = 0
                $rulesUpdated = 0

                foreach ($rule in Get-ChildItem -Path "$ScriptDir\.cursor\rules\*.md") {
                    $ruleName = $rule.Name
                    $target = Join-Path $ProjectDir ".cursor\rules\$ruleName"

                    if (-not (Test-Path $target)) {
                        Copy-Item -Path $rule.FullName -Destination $target -Force
                        Write-ColorOutput "  + Added: $ruleName" "Green"
                        $rulesAdded++
                    } else {
                        $sourceContent = Get-FileHash $rule.FullName -Algorithm MD5
                        $targetContent = Get-FileHash $target -Algorithm MD5
                        if ($sourceContent.Hash -ne $targetContent.Hash) {
                            Backup-File $target | Out-Null
                            Copy-Item -Path $rule.FullName -Destination $target -Force
                            Write-ColorOutput "  ^ Updated: $ruleName" "Cyan"
                            $rulesUpdated++
                        }
                    }
                }

                if ($rulesAdded -eq 0 -and $rulesUpdated -eq 0) {
                    Write-ColorOutput "  All rules up to date" "Green"
                } else {
                    Write-ColorOutput "  $rulesAdded added, $rulesUpdated updated" "Green"
                }
            }
            "codex" {
                New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir ".agents\skills") | Out-Null
                $skillsAdded = 0
                $skillsUpdated = 0

                foreach ($skillDir in Get-ChildItem -Path "$ScriptDir\.agents\skills\*" -Directory) {
                    $skillName = $skillDir.Name
                    $targetDir = Join-Path $ProjectDir ".agents\skills\$skillName"
                    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

                    $skillFile = Join-Path $skillDir.FullName "SKILL.md"
                    if (Test-Path $skillFile) {
                        $target = Join-Path $targetDir "SKILL.md"

                        if (-not (Test-Path $target)) {
                            Copy-Item -Path $skillFile -Destination $target -Force
                            Write-ColorOutput "  + Added: $skillName/SKILL.md" "Green"
                            $skillsAdded++
                        } else {
                            $sourceContent = Get-FileHash $skillFile -Algorithm MD5
                            $targetContent = Get-FileHash $target -Algorithm MD5
                            if ($sourceContent.Hash -ne $targetContent.Hash) {
                                Backup-File $target | Out-Null
                                Copy-Item -Path $skillFile -Destination $target -Force
                                Write-ColorOutput "  ^ Updated: $skillName/SKILL.md" "Cyan"
                                $skillsUpdated++
                            }
                        }
                    }
                }

                # Copy/update AGENTS.md to project root
                if (Test-Path "$ScriptDir\.agents\AGENTS.md") {
                    $agentsTarget = Join-Path $ProjectDir "AGENTS.md"
                    if (-not (Test-Path $agentsTarget)) {
                        Copy-Item -Path "$ScriptDir\.agents\AGENTS.md" -Destination $agentsTarget -Force
                        Write-ColorOutput "  + Added: AGENTS.md" "Green"
                    } else {
                        $sourceHash = (Get-FileHash "$ScriptDir\.agents\AGENTS.md" -Algorithm MD5).Hash
                        $targetHash = (Get-FileHash $agentsTarget -Algorithm MD5).Hash
                        if ($sourceHash -ne $targetHash) {
                            Backup-File $agentsTarget | Out-Null
                            Copy-Item -Path "$ScriptDir\.agents\AGENTS.md" -Destination $agentsTarget -Force
                            Write-ColorOutput "  ^ Updated: AGENTS.md" "Cyan"
                        }
                    }
                }

                if ($skillsAdded -eq 0 -and $skillsUpdated -eq 0) {
                    Write-ColorOutput "  All skills up to date" "Green"
                } else {
                    Write-ColorOutput "  $skillsAdded added, $skillsUpdated updated" "Green"
                }
            }
            "gemini" {
                New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir ".gemini\skills") | Out-Null
                $skillsAdded = 0
                $skillsUpdated = 0

                foreach ($skill in Get-ChildItem -Path "$ScriptDir\.gemini\skills\*.md" -ErrorAction SilentlyContinue) {
                    $skillName = $skill.Name
                    $target = Join-Path $ProjectDir ".gemini\skills\$skillName"

                    if (-not (Test-Path $target)) {
                        Copy-Item -Path $skill.FullName -Destination $target -Force
                        Write-ColorOutput "  + Added: $skillName" "Green"
                        $skillsAdded++
                    } else {
                        $sourceContent = Get-FileHash $skill.FullName -Algorithm MD5
                        $targetContent = Get-FileHash $target -Algorithm MD5
                        if ($sourceContent.Hash -ne $targetContent.Hash) {
                            Backup-File $target | Out-Null
                            Copy-Item -Path $skill.FullName -Destination $target -Force
                            Write-ColorOutput "  ^ Updated: $skillName" "Cyan"
                            $skillsUpdated++
                        }
                    }
                }

                if ($skillsAdded -eq 0 -and $skillsUpdated -eq 0) {
                    Write-ColorOutput "  All skills up to date" "Green"
                } else {
                    Write-ColorOutput "  $skillsAdded added, $skillsUpdated updated" "Green"
                }
            }
        }

        Write-Host ""
    }

    # ── Shared updates (once) ────────────────────────────────────

    # Update shared agents
    Write-Host ""
    Write-ColorOutput "Updating shared agents..." "Yellow"
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir "agents") | Out-Null
    
    $agentsAdded = 0
    $agentsUpdated = 0
    
    foreach ($agent in Get-ChildItem -Path "$ScriptDir\agents\*.md") {
        $agentName = $agent.Name
        $target = Join-Path $ProjectDir "agents\$agentName"
        
        if (-not (Test-Path $target)) {
            Copy-Item -Path $agent.FullName -Destination $target -Force
            Write-ColorOutput "  + Added: $agentName" "Green"
            $agentsAdded++
        } else {
            $sourceContent = Get-FileHash $agent.FullName -Algorithm MD5
            $targetContent = Get-FileHash $target -Algorithm MD5
            if ($sourceContent.Hash -ne $targetContent.Hash) {
                Backup-File $target | Out-Null
                Copy-Item -Path $agent.FullName -Destination $target -Force
                Write-ColorOutput "  ↑ Updated: $agentName" "Cyan"
                $agentsUpdated++
            }
        }
    }
    
    if ($agentsAdded -eq 0 -and $agentsUpdated -eq 0) {
        Write-ColorOutput "  All agents up to date" "Green"
    } else {
        Write-ColorOutput "  $agentsAdded added, $agentsUpdated updated" "Green"
    }
    
    # Update CLAUDE.md
    Write-Host ""
    Write-ColorOutput "Updating CLAUDE.md..." "Yellow"
    
    if (Test-Path (Join-Path $ProjectDir "CLAUDE.md")) {
        $sourceHash = (Get-FileHash "$ScriptDir\CLAUDE.md" -Algorithm MD5).Hash
        $targetHash = (Get-FileHash (Join-Path $ProjectDir "CLAUDE.md") -Algorithm MD5).Hash
        
        if ($sourceHash -ne $targetHash) {
            Backup-File (Join-Path $ProjectDir "CLAUDE.md") | Out-Null
            
            Write-ColorOutput "  CLAUDE.md has local modifications." "Yellow"
            if ($Yes) {
                $choice = "1"
                Write-ColorOutput "  -Yes: overwriting CLAUDE.md (backup saved)" "Green"
            } else {
                Write-Host ""
                Write-Host "  Options:"
                Write-Host "    1) Overwrite with latest (backup saved)"
                Write-Host "    2) Keep current version"
                Write-Host "    3) Save latest as CLAUDE.md.new for manual merge"
                Write-Host ""
                $choice = Read-Host "  Choose [1/2/3]"
            }
            
            switch ($choice) {
                "1" {
                    Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination (Join-Path $ProjectDir "CLAUDE.md") -Force
                    Write-ColorOutput "  ✓ CLAUDE.md overwritten (backup saved)" "Green"
                }
                "2" {
                    Write-ColorOutput "  → Keeping current CLAUDE.md" "Yellow"
                }
                "3" {
                    Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination (Join-Path $ProjectDir "CLAUDE.md.new") -Force
                    Write-ColorOutput "  → Saved as CLAUDE.md.new - merge manually" "Cyan"
                }
                default {
                    Write-ColorOutput "  → Keeping current CLAUDE.md" "Yellow"
                }
            }
        } else {
            Write-ColorOutput "  CLAUDE.md already up to date" "Green"
        }
    } else {
        Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination (Join-Path $ProjectDir "CLAUDE.md") -Force
        Write-ColorOutput "  ✓ CLAUDE.md installed" "Green"
    }
    
    # Update templates and security documents
    Write-Host ""
    Write-ColorOutput "Updating templates and security documents..." "Yellow"
    
    # PRD Template
    New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir "genesis") | Out-Null
    if (Test-Path "$ScriptDir\genesis\TEMPLATE.md") {
        $templateTarget = Join-Path $ProjectDir "genesis\TEMPLATE.md"
        if (-not (Test-Path $templateTarget)) {
            Copy-Item -Path "$ScriptDir\genesis\TEMPLATE.md" -Destination $templateTarget -Force
            Write-ColorOutput "  + Added: genesis/TEMPLATE.md" "Green"
        } else {
            $sourceHash = (Get-FileHash "$ScriptDir\genesis\TEMPLATE.md" -Algorithm MD5).Hash
            $targetHash = (Get-FileHash $templateTarget -Algorithm MD5).Hash
            if ($sourceHash -ne $targetHash) {
                Backup-File $templateTarget | Out-Null
                Copy-Item -Path "$ScriptDir\genesis\TEMPLATE.md" -Destination $templateTarget -Force
                Write-ColorOutput "  ↑ Updated: genesis/TEMPLATE.md" "Cyan"
            }
        }
    }
    
    # Security documents (ANTI_PATTERNS installed to docs/)
    $securityDocs = @{
        "docs\ANTI_PATTERNS_BREADTH.md" = "docs\ANTI_PATTERNS_BREADTH.md"
        "docs\ANTI_PATTERNS_DEPTH.md" = "docs\ANTI_PATTERNS_DEPTH.md"
    }
    foreach ($doc in $securityDocs.Keys) {
        $sourcePath = Join-Path $ScriptDir $securityDocs[$doc]
        if (Test-Path $sourcePath) {
            $docTarget = Join-Path $ProjectDir $doc
            if (-not (Test-Path $docTarget)) {
                Copy-Item -Path $sourcePath -Destination $docTarget -Force
                Write-ColorOutput "  + Added: $doc" "Green"
            } else {
                $sourceHash = (Get-FileHash $sourcePath -Algorithm MD5).Hash
                $targetHash = (Get-FileHash $docTarget -Algorithm MD5).Hash
                if ($sourceHash -ne $targetHash) {
                    Backup-File $docTarget | Out-Null
                    Copy-Item -Path $sourcePath -Destination $docTarget -Force
                    Write-ColorOutput "  ↑ Updated: $doc" "Cyan"
                }
            }
        }
    }
    
    # Set version marker
    Set-ProjectVersion $ProjectDir
    
    # Auto-register
    $projects = Get-RegisteredProjects
    if ($projects -notcontains $ProjectDir) {
        Add-Content -Path $RegistryFile -Value $ProjectDir
    }
    
    $elapsed = Get-ElapsedSeconds

    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "  │  Update Complete                                    │" -ForegroundColor Green
    Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Project:    $ProjectDir"
    Write-Host "  Platforms:  $($platforms -join ', ')"
    Write-Host "  Version:    v$currentVersion → v$FrameworkVersion"
    Write-Host "  Duration:   ${elapsed}s"
    Write-Host "  Backup:     $backupDir"
    Write-Host ""

    Show-WhatsNew $ChangelogFile $FrameworkVersion

    return $true
}

function Update-AllProjects {
    $projects = Get-RegisteredProjects
    if ($projects.Count -eq 0) {
        Write-ColorOutput "No projects registered." "Yellow"
        Write-Host ""
        Write-Host "Register projects with:"
        Write-ColorOutput "  .\update.ps1 -Register C:\path\to\project" "Cyan"
        exit 1
    }
    
    $total = 0
    $updated = 0
    $failed = 0
    
    foreach ($projectDir in $projects) {
        if ($projectDir) {
            $total++
            Write-Host ""
            if (Test-Path $projectDir) {
                try {
                    if (Update-Project $projectDir $Force) {
                        $updated++
                    } else {
                        $failed++
                    }
                } catch {
                    Write-ColorOutput "Failed to update: $projectDir" "Red"
                    Write-ColorOutput $_.Exception.Message "Red"
                    $failed++
                }
            } else {
                Write-ColorOutput "Project not found: $projectDir" "Red"
                $failed++
            }
        }
    }
    
    Write-Host ""
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
    Write-ColorOutput "Summary: $total total, $updated updated, $failed failed" "Cyan"
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

Print-Header

if ($List) {
    Show-ProjectList
} elseif ($Register) {
    Register-Project $Register
} elseif ($All) {
    Update-AllProjects
} elseif ($Diff) {
    Write-ColorOutput "Diff preview not yet implemented in PowerShell version" "Yellow"
    Write-Host "Use the bash version (update.sh) for diff preview"
} elseif ($Project) {
    Update-Project $Project $Force
} else {
    Write-ColorOutput "Usage:" "Yellow"
    Write-Host "  .\update.ps1 -Project C:\path\to\project    # Update single project"
    Write-Host "  .\update.ps1 -Yes -Project .                 # Non-interactive update"
    Write-Host "  .\update.ps1 -All                            # Update all registered"
    Write-Host "  .\update.ps1 -Register C:\path\to\project   # Register project"
    Write-Host "  .\update.ps1 -List                           # List registered"
    Write-Host ""
    Write-Host "Examples:"
    Write-ColorOutput "  .\update.ps1 -Project ." "Cyan"
    Write-ColorOutput "  .\update.ps1 -Yes -All" "Cyan"
    Write-ColorOutput "  .\update.ps1 -Register ." "Cyan"
}
