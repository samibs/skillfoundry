# SkillFoundry - Quick Start Wizard (PowerShell)
# Interactive wizard for first-time setup and project initialization
#
# USAGE:
#   .\scripts\wizard.ps1
#   OR from framework root:
#   pwsh scripts\wizard.ps1

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

# Get script directory (framework root)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptDir = Split-Path -Parent $ScriptDir

# Banner
Write-ColorOutput "+===========================================================+" "Cyan"
Write-ColorOutput "|        SkillFoundry Framework - Quick Start Wizard          |" "Cyan"
Write-ColorOutput "|        Get started in 5 minutes!                         |" "Cyan"
Write-ColorOutput "+===========================================================+" "Cyan"
Write-Host ""

# Step 1: Platform Selection
function Select-Platform {
    Write-ColorOutput "Step 1: Select your AI platform" "Blue"
    Write-Host ""
    Write-Host "Which AI coding tool are you using?"
    Write-Host "  1) Claude Code (Terminal-based)"
    Write-Host "  2) GitHub Copilot CLI"
    Write-Host "  3) Cursor (VS Code fork)"
    Write-Host ""
    $choice = Read-Host "Enter choice (1-3)"
    
    switch ($choice) {
        "1" { return "claude" }
        "2" { return "copilot" }
        "3" { return "cursor" }
        default {
            Write-ColorOutput "Invalid choice." "Red"
            exit 1
        }
    }
}

# Step 2: Project Type Selection
function Select-ProjectType {
    Write-Host ""
    Write-ColorOutput "Step 2: Select project type" "Blue"
    Write-Host ""
    Write-Host "What are you building?"
    Write-Host "  1) Web Application (Frontend + Backend)"
    Write-Host "  2) REST API (Backend only)"
    Write-Host "  3) CLI Tool (Command-line application)"
    Write-Host "  4) Library/Package (Reusable code)"
    Write-Host "  5) Other / Custom"
    Write-Host ""
    $choice = Read-Host "Enter choice (1-5)"
    
    switch ($choice) {
        "1" { return "web-app" }
        "2" { return "api" }
        "3" { return "cli" }
        "4" { return "library" }
        "5" { return "custom" }
        default {
            Write-ColorOutput "Invalid choice." "Red"
            exit 1
        }
    }
}

# Step 3: Tech Stack Selection
function Select-TechStack {
    param([string]$ProjectType)
    
    Write-Host ""
    Write-ColorOutput "Step 3: Select tech stack" "Blue"
    Write-Host ""
    
    switch ($ProjectType) {
        "web-app" {
            Write-Host "Frontend framework:"
            Write-Host "  1) React"
            Write-Host "  2) Angular"
            Write-Host "  3) Vue.js"
            Write-Host "  4) Vanilla HTML/JS"
            Write-Host "  5) Other"
            $frontendChoice = Read-Host "Choice (1-5)"
            $frontend = switch ($frontendChoice) {
                "1" { "react" }
                "2" { "angular" }
                "3" { "vue" }
                "4" { "vanilla" }
                default { "other" }
            }
            
            Write-Host ""
            Write-Host "Backend framework:"
            Write-Host "  1) Node.js (Express/Fastify)"
            Write-Host "  2) Python (FastAPI)"
            Write-Host "  3) Python (Django)"
            Write-Host "  4) .NET (C#)"
            Write-Host "  5) Other"
            $backendChoice = Read-Host "Choice (1-5)"
            $backend = switch ($backendChoice) {
                "1" { "nodejs" }
                "2" { "fastapi" }
                "3" { "django" }
                "4" { "dotnet" }
                default { "other" }
            }
            
            return "$frontend|$backend"
        }
        "api" {
            Write-Host "Backend framework:"
            Write-Host "  1) Node.js (Express/Fastify)"
            Write-Host "  2) Python (FastAPI)"
            Write-Host "  3) Python (Django)"
            Write-Host "  4) .NET (C#)"
            Write-Host "  5) Go"
            Write-Host "  6) Other"
            $choice = Read-Host "Choice (1-6)"
            return switch ($choice) {
                "1" { "nodejs" }
                "2" { "fastapi" }
                "3" { "django" }
                "4" { "dotnet" }
                "5" { "go" }
                default { "other" }
            }
        }
        { $_ -in @("cli", "library") } {
            Write-Host "Language:"
            Write-Host "  1) Python"
            Write-Host "  2) Node.js (JavaScript/TypeScript)"
            Write-Host "  3) Go"
            Write-Host "  4) Rust"
            Write-Host "  5) Other"
            $choice = Read-Host "Choice (1-5)"
            return switch ($choice) {
                "1" { "python" }
                "2" { "nodejs" }
                "3" { "go" }
                "4" { "rust" }
                default { "other" }
            }
        }
        default {
            Write-Host "Custom project - no preset templates"
            return "custom"
        }
    }
}

# Step 4: Generate Starter PRD
function Generate-StarterPRD {
    param(
        [string]$ProjectType,
        [string]$TechStack
    )
    
    Write-Host ""
    Write-ColorOutput "Step 4: Generate starter PRD" "Blue"
    Write-Host ""
    $projectName = Read-Host "Project name"
    $projectDesc = Read-Host "Brief description"
    
    # Create genesis directory if it doesn't exist
    if (-not (Test-Path "genesis")) {
        New-Item -ItemType Directory -Path "genesis" | Out-Null
    }
    
    # Generate PRD
    $prdFileName = ($projectName -replace '\s+', '-').ToLower() + "-initial.md"
    $prdFile = Join-Path "genesis" $prdFileName
    $date = Get-Date -Format "yyyy-MM-dd"
    
    $prdContent = @"
# PRD: $projectName

**Version:** 1.0
**Status:** DRAFT
**Created:** $date
**Author:** Quick Start Wizard

---

## 1. Overview

### 1.1 Problem Statement
$projectDesc

### 1.2 Proposed Solution
Build a $ProjectType using $TechStack to solve the problem described above.

### 1.3 Success Metrics
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Feature completeness | 0% | 100% | All user stories implemented |
| Test coverage | 0% | 80%+ | Automated test suite |

---

## 2. User Stories

### Primary User: End User
| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | user | [define first feature] | [benefit] | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features
| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Initial Feature | [Describe first feature] | Given [context], When [action], Then [result] |

---

## 4. Technical Specifications

### 4.1 Tech Stack
- **Type**: $ProjectType
- **Stack**: $TechStack

### 4.2 Architecture
[To be designed]

---

## 5. Implementation Plan

### Phase 1: MVP
- [ ] Set up project structure
- [ ] Implement core feature
- [ ] Add tests
- [ ] Deploy

---

**Next Steps:**
1. Review and refine this PRD
2. Run: /go (or use your platform's equivalent command)
3. Start implementing!

"@
    
    $prdContent | Out-File -FilePath $prdFile -Encoding UTF8
    Write-ColorOutput "[OK] Created starter PRD: $prdFile" "Green"
    return $prdFile
}

# Main wizard flow
function Main {
    $platform = Select-Platform
    $projectType = Select-ProjectType
    $techStack = Select-TechStack $projectType
    
    Write-Host ""
    Write-ColorOutput "Summary:" "Cyan"
    Write-Host "===================================================="
    Write-Host "  Platform: $platform"
    Write-Host "  Project Type: $projectType"
    Write-Host "  Tech Stack: $techStack"
    Write-Host "===================================================="
    Write-Host ""
    
    if (-not $Silent) {
        $response = Read-Host "Install framework and generate starter PRD? (Y/n)"
        if ($response -match "^[Nn]$") {
            Write-ColorOutput "Wizard cancelled." "Yellow"
            exit 0
        }
    }
    
    # Install framework
    Write-Host ""
    Write-ColorOutput "Installing framework..." "Blue"
    & "$ScriptDir\install.ps1" -Platform $platform -TargetDir .
    
    # Generate starter PRD
    $prdFile = Generate-StarterPRD $projectType $techStack
    
    Write-Host ""
    Write-ColorOutput "[OK] Setup Complete!" "Green"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Review PRD: Get-Content $prdFile"
    Write-Host "  2. Edit PRD: Add your specific requirements"
    switch ($platform) {
        "claude" {
            Write-Host "  3. Start Claude Code: claude"
            Write-Host "  4. Implement: /go"
        }
        "copilot" {
            Write-Host "  3. View available agents: ls .copilot/custom-agents/"
            Write-Host "  4. Read workflow guide: Get-Content .copilot/WORKFLOW-GUIDE.md"
        }
        "cursor" {
            Write-Host "  3. Open Cursor IDE"
            Write-Host "  4. Use in chat: `"use go rule`" to start implementation"
        }
    }
    Write-Host ""
}

# Run wizard
Main
