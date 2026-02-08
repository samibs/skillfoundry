# Claude AS - Agents & Skills Installer (PowerShell)
# Installs the Claude Code, GitHub Copilot CLI, or Cursor framework to a target project
#
# USAGE:
#   From your project directory:
#   C:\DevLab\IDEA\claude_as\install.ps1
#   C:\DevLab\IDEA\claude_as\install.ps1 -Platform copilot
#   C:\DevLab\IDEA\claude_as\install.ps1 -Platform claude
#   C:\DevLab\IDEA\claude_as\install.ps1 -Platform cursor
#
# DO NOT copy the claude_as folder into your project!
# Keep it in one central location and run the installer from there.

param(
    [string]$Platform = "",
    [string]$TargetDir = ".",
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
    
    # Rollback if partial installation
    if ($TargetDir -and (Test-Path $TargetDir)) {
        if ((Test-Path (Join-Path $TargetDir ".claude")) -or 
            (Test-Path (Join-Path $TargetDir ".copilot")) -or 
            (Test-Path (Join-Path $TargetDir ".cursor"))) {
            Write-ColorOutput "Rolling back partial installation..." "Yellow"
            Rollback-Installation
        }
    }
    
    # Diagnostic information
    if ($Debug) {
        Collect-Diagnostics
        Write-ColorOutput "Diagnostics saved to: $(Join-Path $TargetDir '.claude-as-diagnostics.log')" "Cyan"
    }
    
    exit $exitCode
}

# Rollback function
function Rollback-Installation {
    if (-not $TargetDir) { return }
    
    Write-ColorOutput "Cleaning up partial installation..." "Yellow"
    
    # Remove created directories
    $dirs = @(".claude", ".copilot", ".cursor", "genesis")
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
    $diagFile = Join-Path $TargetDir ".claude-as-diagnostics.log"
    
    $diagnostics = @"
# Claude AS Framework - Diagnostic Information
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

# Convert to absolute path
if (Test-Path $TargetDir) {
    $TargetDir = Resolve-Path $TargetDir
} else {
    Write-Error-Enhanced "Target directory does not exist" "Directory not found" $TargetDir "Create the directory first: New-Item -ItemType Directory -Path $TargetDir"
    exit 4  # File not found
}

Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Cyan"
Write-ColorOutput "║      Agents & Skills Installer (Multi-Platform)          ║" "Cyan"
Write-ColorOutput "║                                                           ║" "Cyan"
Write-ColorOutput "║   Genesis-First Development Framework                     ║" "Cyan"
Write-ColorOutput "║   Supports: Claude Code, GitHub Copilot CLI & Cursor      ║" "Cyan"
Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Cyan"
Write-Host ""

# Platform selection if not specified
if ([string]::IsNullOrWhiteSpace($Platform)) {
    Write-ColorOutput "Select your AI platform:" "Yellow"
    Write-Host "  1) Claude Code"
    Write-Host "  2) GitHub Copilot CLI"
    Write-Host "  3) Cursor"
    Write-Host ""
    $choice = Read-Host "Enter choice (1, 2, or 3)"
    
    switch ($choice) {
        "1" { $Platform = "claude" }
        "2" { $Platform = "copilot" }
        "3" { $Platform = "cursor" }
        default {
            Write-ColorOutput "Invalid choice. Exiting." "Red"
            exit 1
        }
    }
}

# Normalize platform name
$Platform = $Platform.ToLower()
if ($Platform -notmatch "^(claude|copilot|cursor)$") {
    Write-Error-Enhanced "Invalid platform specified" "Platform must be 'claude', 'copilot', or 'cursor'" "install.ps1" "Use -Platform claude, -Platform copilot, or -Platform cursor"
    exit 2  # Invalid arguments
}

Write-ColorOutput "Platform: $Platform" "Green"
Write-Host ""

# Check if user accidentally copied claude_as into their project
if (Test-Path (Join-Path $TargetDir "claude_as")) {
    Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Red"
    Write-ColorOutput "║  ERROR: Found 'claude_as' folder in target directory!     ║" "Red"
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Red"
    Write-Host ""
    Write-ColorOutput "You should NOT copy the claude_as folder into your project." "Yellow"
    Write-Host ""
    Write-Host "The correct workflow is:"
    Write-Host "  1. Keep claude_as in a central location (like C:\DevLab\IDEA\)"
    Write-Host "  2. Run this installer FROM that location INTO your project"
    Write-Host ""
    Write-Host "To fix this:"
    Write-ColorOutput "  cd $TargetDir" "Cyan"
    Write-ColorOutput "  Remove-Item -Recurse -Force claude_as" "Cyan"
    Write-ColorOutput "$ScriptDir\install.ps1" "Cyan"
    Write-Host ""
    $response = Read-Host "Remove claude_as folder and continue? (y/N)"
    if ($response -match "^[Yy]$") {
        Remove-Item -Recurse -Force (Join-Path $TargetDir "claude_as")
        Write-ColorOutput "Removed claude_as folder. Continuing installation..." "Green"
        Write-Host ""
    } else {
        Write-ColorOutput "Installation cancelled." "Red"
        exit 1
    }
}

# Check if installing into the claude_as source folder itself
if ($TargetDir -eq $ScriptDir) {
    Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Red"
    Write-ColorOutput "║  ERROR: Cannot install into the source folder itself!     ║" "Red"
    Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Red"
    Write-Host ""
    Write-Host "You're trying to install into the claude_as template folder."
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

# Check if platform directory already exists
if ($Platform -eq "claude" -and (Test-Path (Join-Path $TargetDir ".claude"))) {
    Write-ColorOutput "Warning: .claude directory already exists." "Yellow"
    $response = Read-Host "Overwrite existing skills? (y/N)"
    if ($response -notmatch "^[Yy]$") {
        Write-ColorOutput "Installation cancelled." "Red"
        exit 1
    }
} elseif ($Platform -eq "copilot" -and (Test-Path (Join-Path $TargetDir ".copilot"))) {
    Write-ColorOutput "Warning: .copilot directory already exists." "Yellow"
    $response = Read-Host "Overwrite existing agents? (y/N)"
    if ($response -notmatch "^[Yy]$") {
        Write-ColorOutput "Installation cancelled." "Red"
        exit 1
    }
} elseif ($Platform -eq "cursor" -and (Test-Path (Join-Path $TargetDir ".cursor"))) {
    Write-ColorOutput "Warning: .cursor directory already exists." "Yellow"
    $response = Read-Host "Overwrite existing rules? (y/N)"
    if ($response -notmatch "^[Yy]$") {
        Write-ColorOutput "Installation cancelled." "Red"
        exit 1
    }
}

# Create directory structure based on platform
Write-ColorOutput "Creating directory structure..." "Blue"
if ($Platform -eq "claude") {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".claude\commands") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "agents") | Out-Null
} elseif ($Platform -eq "copilot") {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".copilot\custom-agents") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "agents") | Out-Null
} else {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".cursor\rules") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "agents") | Out-Null
}
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "genesis") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir "docs\stories") | Out-Null

# Copy skills/agents/rules based on platform
Write-ColorOutput "Installing agents and skills..." "Blue"
if ($Platform -eq "claude") {
    Copy-Item -Path "$ScriptDir\.claude\commands\*" -Destination "$TargetDir\.claude\commands\" -Recurse -Force
    $SkillCount = (Get-ChildItem -Path "$TargetDir\.claude\commands\*.md" -ErrorAction SilentlyContinue).Count
    Write-ColorOutput "  ✓ Claude skills installed ($SkillCount skills)" "Green"
} elseif ($Platform -eq "copilot") {
    Copy-Item -Path "$ScriptDir\.copilot\custom-agents\*" -Destination "$TargetDir\.copilot\custom-agents\" -Recurse -Force
    if (Test-Path "$ScriptDir\.copilot\helper.sh") {
        Copy-Item -Path "$ScriptDir\.copilot\helper.sh" -Destination "$TargetDir\.copilot\" -Force
    }
    if (Test-Path "$ScriptDir\.copilot\WORKFLOW-GUIDE.md") {
        Copy-Item -Path "$ScriptDir\.copilot\WORKFLOW-GUIDE.md" -Destination "$TargetDir\.copilot\" -Force
    }
    $AgentCount = (Get-ChildItem -Path "$TargetDir\.copilot\custom-agents\*.md" -ErrorAction SilentlyContinue).Count
    Write-ColorOutput "  ✓ Copilot custom agents installed ($AgentCount agents)" "Green"
    Write-ColorOutput "  ✓ Copilot helper and workflow guide installed" "Green"
} else {
    Copy-Item -Path "$ScriptDir\.cursor\rules\*" -Destination "$TargetDir\.cursor\rules\" -Recurse -Force
    $RuleCount = (Get-ChildItem -Path "$TargetDir\.cursor\rules\*.md" -ErrorAction SilentlyContinue).Count
    Write-ColorOutput "  ✓ Cursor rules installed ($RuleCount rules)" "Green"
}

# Copy shared agent modules
Copy-Item -Path "$ScriptDir\agents\*" -Destination "$TargetDir\agents\" -Recurse -Force
$SharedCount = (Get-ChildItem -Path "$TargetDir\agents\*.md" -ErrorAction SilentlyContinue).Count
Write-ColorOutput "  ✓ Shared agent modules installed ($SharedCount modules)" "Green"

# Copy CLAUDE.md
if (Test-Path (Join-Path $TargetDir "CLAUDE.md")) {
    Write-ColorOutput "  CLAUDE.md already exists." "Yellow"
    $response = Read-Host "  Overwrite? (y/N)"
    if ($response -match "^[Yy]$") {
        Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination "$TargetDir\CLAUDE.md" -Force
        Write-ColorOutput "  ✓ CLAUDE.md updated" "Green"
    } else {
        Write-ColorOutput "  → Keeping existing CLAUDE.md" "Yellow"
    }
} else {
    Copy-Item -Path "$ScriptDir\CLAUDE.md" -Destination "$TargetDir\CLAUDE.md" -Force
    Write-ColorOutput "  ✓ CLAUDE.md installed" "Green"
}

# Copy PRD template
Copy-Item -Path "$ScriptDir\genesis\TEMPLATE.md" -Destination "$TargetDir\genesis\" -Force
Write-ColorOutput "  ✓ PRD template installed to genesis/" "Green"

# Copy bpsbs.md and security documents
if (-not (Test-Path (Join-Path $TargetDir "bpsbs.md"))) {
    Copy-Item -Path "$ScriptDir\bpsbs.md" -Destination "$TargetDir\" -Force
    Write-ColorOutput "  ✓ bpsbs.md installed" "Green"
}

if (-not (Test-Path (Join-Path $TargetDir "ANTI_PATTERNS_BREADTH.md"))) {
    Copy-Item -Path "$ScriptDir\docs\ANTI_PATTERNS_BREADTH.md" -Destination "$TargetDir\" -Force
    Write-ColorOutput "  ✓ ANTI_PATTERNS_BREADTH.md installed" "Green"
}

if (-not (Test-Path (Join-Path $TargetDir "ANTI_PATTERNS_DEPTH.md"))) {
    Copy-Item -Path "$ScriptDir\docs\ANTI_PATTERNS_DEPTH.md" -Destination "$TargetDir\" -Force
    Write-ColorOutput "  ✓ ANTI_PATTERNS_DEPTH.md installed" "Green"
}

# Set framework version marker
$VersionFile = Join-Path $ScriptDir ".version"
if (-not (Test-Path $VersionFile)) {
    Write-ColorOutput "Error: .version file not found at $VersionFile" "Red"
    exit 1
}
$FrameworkVersion = (Get-Content $VersionFile -Raw).Trim()
$FrameworkDate = "2026-01-20"

if ($Platform -eq "claude") {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".claude") | Out-Null
    $FrameworkVersion | Out-File -FilePath (Join-Path $TargetDir ".claude\.framework-version") -Encoding utf8 -NoNewline
    $FrameworkDate | Out-File -FilePath (Join-Path $TargetDir ".claude\.framework-updated") -Encoding utf8 -NoNewline
    $Platform | Out-File -FilePath (Join-Path $TargetDir ".claude\.framework-platform") -Encoding utf8 -NoNewline
} elseif ($Platform -eq "copilot") {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".copilot") | Out-Null
    $FrameworkVersion | Out-File -FilePath (Join-Path $TargetDir ".copilot\.framework-version") -Encoding utf8 -NoNewline
    $FrameworkDate | Out-File -FilePath (Join-Path $TargetDir ".copilot\.framework-updated") -Encoding utf8 -NoNewline
    $Platform | Out-File -FilePath (Join-Path $TargetDir ".copilot\.framework-platform") -Encoding utf8 -NoNewline
} else {
    New-Item -ItemType Directory -Force -Path (Join-Path $TargetDir ".cursor") | Out-Null
    $FrameworkVersion | Out-File -FilePath (Join-Path $TargetDir ".cursor\.framework-version") -Encoding utf8 -NoNewline
    $FrameworkDate | Out-File -FilePath (Join-Path $TargetDir ".cursor\.framework-updated") -Encoding utf8 -NoNewline
    $Platform | Out-File -FilePath (Join-Path $TargetDir ".cursor\.framework-platform") -Encoding utf8 -NoNewline
}
Write-ColorOutput "  ✓ Framework version: v$FrameworkVersion (Platform: $Platform)" "Green"

# Auto-register project for updates
$RegistryFile = Join-Path $ScriptDir ".project-registry"
$RegistryContent = @()
if (Test-Path $RegistryFile) {
    $RegistryContent = Get-Content $RegistryFile
}
if ($RegistryContent -notcontains $TargetDir) {
    Add-Content -Path $RegistryFile -Value $TargetDir
}
Write-ColorOutput "  ✓ Registered for framework updates" "Green"

# Summary
Write-Host ""
Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Green"
Write-ColorOutput "║                  Installation Complete!                    ║" "Green"
Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Green"
Write-Host ""
Write-ColorOutput "Project: $TargetDir" "Blue"
Write-ColorOutput "Platform: $Platform" "Blue"
Write-Host ""
Write-Host "Installed:"
if ($Platform -eq "claude") {
    Write-Host "  ├── .claude/commands/     ($SkillCount skills)"
    Write-Host "  ├── agents/               ($SharedCount shared modules)"
} elseif ($Platform -eq "copilot") {
    Write-Host "  ├── .copilot/custom-agents/ ($AgentCount agents)"
    Write-Host "  ├── agents/                 ($SharedCount shared modules)"
} else {
    Write-Host "  ├── .cursor/rules/        ($RuleCount rules)"
    Write-Host "  ├── agents/               ($SharedCount shared modules)"
}
Write-Host "  ├── genesis/              (PRD folder)"
Write-Host "  │   └── TEMPLATE.md"
Write-Host "  ├── docs/stories/         (story output)"
Write-Host "  ├── CLAUDE.md"
Write-Host "  ├── bpsbs.md"
Write-Host "  ├── ANTI_PATTERNS_BREADTH.md  (Security - wide coverage)"
Write-Host "  └── ANTI_PATTERNS_DEPTH.md    (Security - top 7 critical)"
Write-Host ""
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "                   THE GENESIS WORKFLOW                    " "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

if ($Platform -eq "claude") {
    Write-ColorOutput "Step 1: Create PRDs" "Yellow"
    Write-Host "  /prd `"your feature idea`"     → Saved to genesis/"
    Write-Host "  Or manually create in genesis/"
    Write-Host ""
    Write-ColorOutput "Step 2: Implement" "Yellow"
    Write-Host "  /go                           → Full implementation"
    Write-Host ""
    Write-ColorOutput "That's it. PRDs in genesis/ → /go → Production code." "Green"
    Write-Host ""
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
    Write-Host ""
    Write-ColorOutput "Key Commands:" "Yellow"
    Write-Host "  /go              - Implement all PRDs from genesis/"
    Write-Host "  /go --validate   - Check PRDs are complete"
    Write-Host "  /prd             - Create new PRD"
    Write-Host "  /layer-check     - Validate three layers"
    Write-Host "  /coder           - Ruthless implementation"
    Write-Host "  /tester          - Brutal testing"
    Write-Host "  /architect       - Architecture review"
    Write-Host ""
    Write-ColorOutput "Start now:" "Green"
    Write-Host "  cd $TargetDir"
    Write-Host "  claude"
    Write-Host "  > /prd `"Your feature idea`""
    Write-Host "  > /go"
} elseif ($Platform -eq "cursor") {
    Write-ColorOutput "Step 1: Create PRDs" "Yellow"
    Write-Host "  Manually create in genesis/ folder"
    Write-Host "  Use genesis/TEMPLATE.md as guide"
    Write-Host ""
    Write-ColorOutput "Step 2: Implement" "Yellow"
    Write-Host "  Use rules via Cursor AI chat"
    Write-Host "  Rules are automatically loaded from .cursor/rules/"
    Write-Host ""
    Write-ColorOutput "PRDs in genesis/ → use rules in Cursor → Production code." "Green"
    Write-Host ""
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
    Write-Host ""
    Write-ColorOutput "Available Rules:" "Yellow"
    Write-Host "  go.md            - Project kickstart orchestrator"
    Write-Host "  prd.md           - PRD creation"
    Write-Host "  coder.md         - Ruthless implementation with TDD"
    Write-Host "  tester.md        - Brutal testing"
    Write-Host "  architect.md      - Architecture review"
    Write-Host "  layer-check.md   - Three-layer validation"
    Write-Host "  + 16 more in .cursor/rules/"
    Write-Host ""
    Write-ColorOutput "Usage in Cursor:" "Yellow"
    Write-Host "  1. Open Cursor in this project"
    Write-Host "  2. Rules are automatically available in chat"
    Write-Host "  3. Reference rules by name: 'use go rule' or 'follow coder rule'"
    Write-Host "  4. Rules provide structured workflows and commands"
    Write-Host ""
    Write-ColorOutput "Rules are automatically loaded by Cursor from .cursor/rules/" "Green"
} else {
    Write-ColorOutput "Step 1: Create PRDs" "Yellow"
    Write-Host "  Manually create in genesis/ folder"
    Write-Host "  Use genesis/TEMPLATE.md as guide"
    Write-Host ""
    Write-ColorOutput "Step 2: Implement" "Yellow"
    Write-Host "  Use agents via task tool in Copilot CLI"
    Write-Host ""
    Write-ColorOutput "PRDs in genesis/ → invoke agents → Production code." "Green"
    Write-Host ""
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
    Write-Host ""
    Write-ColorOutput "Available Agents:" "Yellow"
    Write-Host "  coder            - Ruthless implementation with TDD"
    Write-Host "  tester           - Brutal testing"
    Write-Host "  architect        - Architecture review"
    Write-Host "  evaluator        - BPSBS compliance"
    Write-Host "  debugger         - Systematic debugging"
    Write-Host "  docs             - Documentation"
    Write-Host "  + 16 more in .copilot/custom-agents/"
    Write-Host ""
    Write-ColorOutput "Example Usage:" "Yellow"
    Write-Host '  task('
    Write-Host '    agent_type="task",'
    Write-Host '    description="Implement auth service",'
    Write-Host '    prompt="Read .copilot/custom-agents/coder.md and genesis/auth.md, then implement"'
    Write-Host '  )'
    Write-Host ""
    Write-ColorOutput "See .copilot/custom-agents/README.md for details" "Green"
}

Write-Host ""
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "                   FRAMEWORK UPDATES                       " "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""
Write-Host "To receive framework updates in this project:"
Write-ColorOutput "  $ScriptDir\update.ps1 $TargetDir" "Cyan"
Write-Host ""
Write-Host "To update all registered projects:"
Write-ColorOutput "  $ScriptDir\update.ps1 -All" "Cyan"
Write-Host ""
Write-ColorOutput "Happy building!" "Blue"
