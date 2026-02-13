# Claude AS - One-Click Unified Installer (PowerShell)
# Auto-detects platform and OS, installs framework with minimal user input
#
# USAGE:
#   iwr https://raw.githubusercontent.com/your-repo/claude_as/main/install-unified.ps1 | iex
#   OR download and run:
#   .\install-unified.ps1

param(
    [switch]$Silent = $false
)

$ErrorActionPreference = "Stop"

# Colors
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Banner
Write-ColorOutput "╔═══════════════════════════════════════════════════════════╗" "Cyan"
Write-ColorOutput "║     Claude AS Framework - One-Click Installer             ║" "Cyan"
Write-ColorOutput "║     Multi-Platform AI Agent & Skills Framework           ║" "Cyan"
Write-ColorOutput "╚═══════════════════════════════════════════════════════════╝" "Cyan"
Write-Host ""

# Detect platforms (Claude Code, Copilot CLI, Cursor, Codex)
function Detect-Platform {
    $platforms = @()

    # Check for Claude Code
    if (Get-Command claude -ErrorAction SilentlyContinue) {
        $platforms += "claude"
        Write-ColorOutput "✓ Detected: Claude Code" "Green"
    }

    # Check for GitHub Copilot CLI
    if ((Get-Command github-copilot-cli -ErrorAction SilentlyContinue) -or
        (Get-Command copilot -ErrorAction SilentlyContinue)) {
        $platforms += "copilot"
        Write-ColorOutput "✓ Detected: GitHub Copilot CLI" "Green"
    }

    # Check for Cursor
    $cursorPaths = @(
        "$env:USERPROFILE\.cursor",
        "$env:APPDATA\Cursor",
        "$env:LOCALAPPDATA\Programs\cursor"
    )

    $cursorFound = $false
    foreach ($path in $cursorPaths) {
        if (Test-Path $path) {
            $cursorFound = $true
            break
        }
    }

    if ($cursorFound -or (Get-Command cursor -ErrorAction SilentlyContinue)) {
        $platforms += "cursor"
        Write-ColorOutput "✓ Detected: Cursor" "Green"
    }

    # Check for OpenAI Codex CLI
    if (Get-Command codex -ErrorAction SilentlyContinue) {
        $platforms += "codex"
        Write-ColorOutput "✓ Detected: OpenAI Codex" "Green"
    }

    return ,$platforms
}

# Get framework location
function Get-FrameworkLocation {
    # Try common locations
    $locations = @(
        "$env:USERPROFILE\DevLab\IDEA\claude_as",
        "$env:USERPROFILE\dev_tools\claude_as",
        "$env:USERPROFILE\claude_as",
        ".\claude_as"
    )
    
    foreach ($loc in $locations) {
        if ((Test-Path $loc) -and (Test-Path (Join-Path $loc "install.ps1"))) {
            return $loc
        }
    }
    
    # If not found, ask user
    Write-Host ""
    Write-ColorOutput "Framework not found in common locations." "Yellow"
    Write-ColorOutput "Please enter the path to your claude_as framework directory:" "Cyan"
    $frameworkPath = Read-Host "Path"
    
    if ((Test-Path $frameworkPath) -and (Test-Path (Join-Path $frameworkPath "install.ps1"))) {
        return $frameworkPath
    } else {
        Write-ColorOutput "Error: Invalid framework directory" "Red"
        exit 1
    }
}

# Get target project directory
function Get-TargetDirectory {
    $target = Get-Location
    
    # Check if we're in a project directory
    $projectIndicators = @(".git", "package.json", "requirements.txt", "Cargo.toml", "go.mod", ".csproj")
    $isProject = $false
    
    foreach ($indicator in $projectIndicators) {
        if (Test-Path $indicator) {
            $isProject = $true
            break
        }
    }
    
    if ($isProject) {
        Write-ColorOutput "✓ Detected project directory: $(Split-Path $target -Leaf)" "Green"
        return $target
    } else {
        Write-ColorOutput "⚠ Not in a project directory. Install to current directory?" "Yellow"
        $response = Read-Host "Continue? (y/N)"
        if ($response -notmatch "^[Yy]$") {
            $target = Read-Host "Enter project directory path"
        }
    }
    
    return $target
}

# Helper: Parse comma-separated platform choices into platform name array
function Select-PlatformsFromMenu {
    Write-Host ""
    Write-Host "Select platforms (comma-separated, e.g. 1,3,4):"
    Write-Host "  1) Claude Code"
    Write-Host "  2) GitHub Copilot CLI"
    Write-Host "  3) Cursor"
    Write-Host "  4) OpenAI Codex"
    Write-Host ""
    $input = Read-Host "Platforms"

    $platformMap = @{
        "1" = "claude"
        "2" = "copilot"
        "3" = "cursor"
        "4" = "codex"
    }

    $selected = @()
    $choices = $input -split "," | ForEach-Object { $_.Trim() }

    foreach ($c in $choices) {
        if ($platformMap.ContainsKey($c)) {
            $selected += $platformMap[$c]
        } else {
            Write-ColorOutput "Invalid choice: $c (skipping)" "Yellow"
        }
    }

    if ($selected.Count -eq 0) {
        Write-ColorOutput "No valid platforms selected. Exiting." "Red"
        exit 1
    }

    return ,$selected
}

# Main installation flow
function Main {
    Write-ColorOutput "Step 1: Detecting environment..." "Blue"
    Write-ColorOutput "✓ OS: Windows" "Green"

    $detected = Detect-Platform

    if ($detected.Count -eq 0) {
        Write-ColorOutput "⚠ No AI platform detected automatically." "Yellow"
        $platforms = Select-PlatformsFromMenu
    } else {
        $detectedList = $detected -join ", "
        Write-Host ""
        Write-ColorOutput "Detected platforms: $detectedList" "Green"
        Write-Host ""
        Write-Host "Install for which platforms?"
        Write-Host "  1) All detected ($detectedList) [Recommended]"
        Write-Host "  2) Choose specific platforms"
        Write-Host ""
        $choice = Read-Host "Choice (1-2)"

        switch ($choice) {
            "1" { $platforms = $detected }
            "2" { $platforms = Select-PlatformsFromMenu }
            default { $platforms = $detected }
        }
    }

    $platformsList = $platforms -join ", "
    Write-ColorOutput "✓ Platforms: $platformsList" "Green"

    Write-Host ""
    Write-ColorOutput "Step 2: Locating framework..." "Blue"
    $frameworkDir = Get-FrameworkLocation
    Write-ColorOutput "✓ Framework: $frameworkDir" "Green"

    Write-Host ""
    Write-ColorOutput "Step 3: Selecting target project..." "Blue"
    $targetDir = Get-TargetDirectory
    Write-ColorOutput "✓ Target: $targetDir" "Green"

    Write-Host ""
    Write-ColorOutput "Installation Summary:" "Cyan"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "  Platforms: $platformsList"
    Write-Host "  Framework: $frameworkDir"
    Write-Host "  Target: $targetDir"
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host ""

    if (-not $Silent) {
        $response = Read-Host "Proceed with installation? (Y/n)"
        if ($response -match "^[Nn]$") {
            Write-ColorOutput "Installation cancelled." "Yellow"
            exit 0
        }
    }

    Write-Host ""
    Write-ColorOutput "Step 4: Installing framework..." "Blue"

    Push-Location $targetDir
    try {
        foreach ($plat in $platforms) {
            Write-Host ""
            Write-ColorOutput "Installing for platform: $plat" "Cyan"
            & "$frameworkDir\install.ps1" -Platform $plat
        }
    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-ColorOutput "✓ Installation Complete!" "Green"
    Write-Host ""
    Write-Host "Next steps:"
    foreach ($plat in $platforms) {
        switch ($plat) {
            "claude" {
                Write-Host "  [$plat]"
                Write-Host "  1. Run: claude"
                Write-Host "  2. Create PRD: /prd `"your feature`""
                Write-Host "  3. Implement: /go"
            }
            "copilot" {
                Write-Host "  [$plat]"
                Write-Host "  1. View agents: ls .copilot/custom-agents/"
                Write-Host "  2. Run helper: .copilot/helper.sh"
                Write-Host "  3. Read guide: cat .copilot/WORKFLOW-GUIDE.md"
            }
            "cursor" {
                Write-Host "  [$plat]"
                Write-Host "  1. Open Cursor IDE"
                Write-Host "  2. Rules are automatically loaded from .cursor/rules/"
                Write-Host "  3. Use in chat: `"use go rule`" or `"follow coder rule`""
            }
            "codex" {
                Write-Host "  [$plat]"
                Write-Host "  1. Run: codex"
                Write-Host "  2. Skills auto-loaded from .agents/skills/"
                Write-Host "  3. Invoke skills: `$go, `$coder, `$tester, etc."
                Write-Host "  4. Or let Codex auto-select based on your prompt"
                Write-Host "  5. See AGENTS.md for framework overview"
            }
        }
        Write-Host ""
    }
}

# Run main function
Main
