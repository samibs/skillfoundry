# Memory Manager - Command-line interface for persistent memory (PowerShell)
# Provides /remember, /recall, /correct commands

param(
    [Parameter(Position=0)]
    [ValidateSet("remember", "recall", "correct", "status")]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$Content = "",
    
    [string]$Type = "fact",
    [string]$Tags = "",
    [string]$Id = "",
    [int]$Limit = 10
)

$ErrorActionPreference = "Stop"

$MemoryBankDir = if ($env:MEMORY_BANK_DIR) { $env:MEMORY_BANK_DIR } else { "memory_bank" }
$KnowledgeDir = Join-Path $MemoryBankDir "knowledge"
$RelationshipsDir = Join-Path $MemoryBankDir "relationships"
$RetrievalDir = Join-Path $MemoryBankDir "retrieval"

# Framework directory (for bootstrap data)
$FrameworkDir = if ($env:FRAMEWORK_DIR) { $env:FRAMEWORK_DIR } else { Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }

# Initialize memory bank structure
function Initialize-MemoryBank {
    New-Item -ItemType Directory -Force -Path $KnowledgeDir | Out-Null
    New-Item -ItemType Directory -Force -Path $RelationshipsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $RetrievalDir | Out-Null

    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    # Create JSONL files if they don't exist
    $files = @("facts.jsonl", "decisions.jsonl", "errors.jsonl", "preferences.jsonl")
    foreach ($file in $files) {
        $path = Join-Path $KnowledgeDir $file
        if (-not (Test-Path $path)) {
            New-Item -ItemType File -Path $path | Out-Null
        }
    }

    # Create JSON files with valid initial structure (not empty)
    $kgPath = Join-Path $RelationshipsDir "knowledge-graph.json"
    if (-not (Test-Path $kgPath) -or (Get-Item $kgPath).Length -eq 0) {
        @{nodes=@();edges=@();metadata=@{created=$timestamp;updated=$timestamp;version="1.0"}} | ConvertTo-Json -Depth 3 | Set-Content $kgPath
    }

    $linPath = Join-Path $RelationshipsDir "lineage.json"
    if (-not (Test-Path $linPath) -or (Get-Item $linPath).Length -eq 0) {
        @{entries=@();corrections=@();metadata=@{created=$timestamp;updated=$timestamp;version="1.0"}} | ConvertTo-Json -Depth 3 | Set-Content $linPath
    }

    $qcPath = Join-Path $RetrievalDir "query-cache.json"
    if (-not (Test-Path $qcPath) -or (Get-Item $qcPath).Length -eq 0) {
        @{cache=@();max_size=1000;metadata=@{created=$timestamp;updated=$timestamp;version="1.0"}} | ConvertTo-Json -Depth 3 | Set-Content $qcPath
    }

    $wPath = Join-Path $RetrievalDir "weights.json"
    if (-not (Test-Path $wPath) -or (Get-Item $wPath).Length -eq 0) {
        @{adjustments=@();metadata=@{created=$timestamp;updated=$timestamp;version="1.0"}} | ConvertTo-Json -Depth 3 | Set-Content $wPath
    }

    # Copy bootstrap knowledge if available and facts.jsonl is empty
    $factsPath = Join-Path $KnowledgeDir "facts.jsonl"
    $bootstrapSource = Join-Path $FrameworkDir "memory_bank/knowledge/bootstrap.jsonl"
    if ((Get-Item $factsPath).Length -eq 0 -and (Test-Path $bootstrapSource)) {
        $bootstrapDest = Join-Path $KnowledgeDir "bootstrap.jsonl"
        Copy-Item $bootstrapSource $bootstrapDest
        Write-Host "Copied bootstrap knowledge to memory bank" -ForegroundColor Green
    }
}

# Generate UUID
function New-Guid {
    return [System.Guid]::NewGuid().ToString()
}

# Store knowledge
function Remember-Knowledge {
    param(
        [string]$Content,
        [string]$Type = "fact",
        [string]$Tags = ""
    )
    
    if ([string]::IsNullOrWhiteSpace($Content)) {
        Write-Host "Error: Content required" -ForegroundColor Red
        exit 1
    }
    
    Initialize-MemoryBank
    
    $id = New-Guid
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    $file = Join-Path $KnowledgeDir "${Type}s.jsonl"
    
    # Extract tags from content if not provided
    if ([string]::IsNullOrWhiteSpace($Tags)) {
        $words = $Content.ToLower() -split '\s+' | Where-Object { $_.Length -ge 4 }
        $Tags = ($words | Select-Object -First 5) -join ","
    }
    
    $tagsArray = if ($Tags) { $Tags -split ',' | ForEach-Object { "`"$_`"" } } else { @() }
    
    # Create memory entry
    $entry = @{
        id = $id
        type = $Type
        content = $Content
        created_at = $timestamp
        created_by = "user"
        session_id = if ($env:SESSION_ID) { $env:SESSION_ID } else { "unknown" }
        context = @{
            prd_id = if ($env:PRD_ID) { $env:PRD_ID } else { "" }
            story_id = if ($env:STORY_ID) { $env:STORY_ID } else { "" }
            phase = if ($env:PHASE) { $env:PHASE } else { "" }
        }
        weight = 0.5
        validation_count = 0
        retrieval_count = 0
        tags = $tagsArray
        reality_anchor = @{
            has_tests = $false
            test_file = $null
            test_passing = $false
        }
        lineage = @{
            parent_id = $null
            supersedes = @()
            superseded_by = $null
        }
    }
    
    # Append to JSONL file
    $entry | ConvertTo-Json -Compress | Add-Content -Path $file
    
    Write-Host "MEMORY STORED" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "ID: $id"
    Write-Host "Type: $Type"
    Write-Host "Content: $($Content.Substring(0, [Math]::Min(100, $Content.Length)))..."
    Write-Host "Weight: 0.5"
    Write-Host "Tags: $Tags"
    Write-Host "Stored: $timestamp"
}

# Recall knowledge
function Recall-Knowledge {
    param(
        [string]$Query,
        [string]$Type = "",
        [int]$Limit = 10
    )
    
    if ([string]::IsNullOrWhiteSpace($Query)) {
        Write-Host "Error: Query required" -ForegroundColor Red
        exit 1
    }
    
    Initialize-MemoryBank
    
    Write-Host "MEMORY SEARCH: `"$Query`"" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    $files = @()
    if ([string]::IsNullOrWhiteSpace($Type)) {
        $files = @(
            (Join-Path $KnowledgeDir "facts.jsonl"),
            (Join-Path $KnowledgeDir "decisions.jsonl"),
            (Join-Path $KnowledgeDir "errors.jsonl"),
            (Join-Path $KnowledgeDir "preferences.jsonl")
        )
    } else {
        $files = @(Join-Path $KnowledgeDir "${Type}s.jsonl")
    }
    
    $count = 0
    foreach ($file in $files) {
        if (Test-Path $file) {
            $lines = Get-Content $file | Where-Object { $_ -and $_.Trim() }
            foreach ($line in $lines) {
                try {
                    $entry = $line | ConvertFrom-Json
                    $content = $entry.content
                    $weight = if ($entry.weight) { $entry.weight } else { 0.5 }
                    
                    # Simple text search (case-insensitive)
                    if ($content -match [regex]::Escape($Query)) {
                        $count++
                        if ($count -le $Limit) {
                            Write-Host ""
                            $preview = if ($content.Length -gt 80) { $content.Substring(0, 80) + "..." } else { $content }
                            Write-Host "[$count] [Weight: $weight] $preview"
                            Write-Host "  [ID: $($entry.id)]"
                        }
                    }
                } catch {
                    # Skip invalid JSON
                    continue
                }
            }
        }
    }
    
    if ($count -eq 0) {
        Write-Host "Found 0 items"
    } else {
        Write-Host ""
        Write-Host "Found $count items (showing top $Limit)"
    }
}

# Correct knowledge
function Correct-Knowledge {
    param(
        [string]$Correction,
        [string]$OldId
    )
    
    if ([string]::IsNullOrWhiteSpace($Correction)) {
        Write-Host "Error: Correction content required" -ForegroundColor Red
        exit 1
    }
    
    if ([string]::IsNullOrWhiteSpace($OldId)) {
        Write-Host "Error: Old entry ID required (--Id=UUID)" -ForegroundColor Red
        exit 1
    }
    
    Initialize-MemoryBank
    
    # Find old entry
    $oldEntry = $null
    $oldFile = $null
    foreach ($file in (Get-ChildItem -Path $KnowledgeDir -Filter "*.jsonl")) {
        $lines = Get-Content $file.FullName | Where-Object { $_ -and $_.Trim() }
        foreach ($line in $lines) {
            try {
                $entry = $line | ConvertFrom-Json
                if ($entry.id -eq $OldId) {
                    $oldEntry = $entry
                    $oldFile = $file.FullName
                    break
                }
            } catch {
                continue
            }
        }
        if ($oldEntry) { break }
    }
    
    if (-not $oldEntry) {
        Write-Host "Error: Entry not found: $OldId" -ForegroundColor Red
        exit 1
    }
    
    # Create new entry
    $newId = New-Guid
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    
    # Reduce old entry weight
    $oldWeight = if ($oldEntry.weight) { $oldEntry.weight } else { 0.5 }
    $newWeight = [Math]::Round($oldWeight * 0.3, 2)
    
    # Update old entry in file
    $tempLines = @()
    $lines = Get-Content $oldFile | Where-Object { $_ -and $_.Trim() }
    foreach ($line in $lines) {
        try {
            $entry = $line | ConvertFrom-Json
            if ($entry.id -eq $OldId) {
                $entry.weight = $newWeight
                if (-not $entry.lineage) { $entry | Add-Member -NotePropertyName "lineage" -NotePropertyValue @{} }
                if (-not $entry.lineage.PSObject.Properties["superseded_by"]) {
                    $entry.lineage | Add-Member -NotePropertyName "superseded_by" -NotePropertyValue $newId
                } else {
                    $entry.lineage.superseded_by = $newId
                }
                $tempLines += ($entry | ConvertTo-Json -Compress)
            } else {
                $tempLines += $line
            }
        } catch {
            $tempLines += $line
        }
    }
    $tempLines | Set-Content -Path $oldFile
    
    # Create new entry
    $newEntry = @{
        id = $newId
        type = $oldEntry.type
        content = $Correction
        created_at = $timestamp
        created_by = "user"
        session_id = if ($env:SESSION_ID) { $env:SESSION_ID } else { "unknown" }
        context = if ($oldEntry.context) { $oldEntry.context } else { @{} }
        weight = 0.7
        validation_count = 0
        retrieval_count = 0
        tags = if ($oldEntry.tags) { $oldEntry.tags } else { @() }
        reality_anchor = @{
            has_tests = $false
            test_file = $null
            test_passing = $false
        }
        lineage = @{
            parent_id = $OldId
            supersedes = @($OldId)
            superseded_by = $null
        }
    }
    
    $newEntry | ConvertTo-Json -Compress | Add-Content -Path $oldFile
    
    Write-Host "KNOWLEDGE CORRECTED" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "Old Entry: [ID: $OldId]"
    Write-Host "  Weight: $oldWeight → $newWeight (reduced)"
    Write-Host ""
    Write-Host "New Entry: [ID: $newId]"
    Write-Host "  Weight: 0.7 (initial)"
    Write-Host "  Supersedes: $OldId"
}

# Main command dispatcher
switch ($Command) {
    "remember" {
        Remember-Knowledge -Content $Content -Type $Type -Tags $Tags
    }
    "recall" {
        Recall-Knowledge -Query $Content -Type $Type -Limit $Limit
    }
    "correct" {
        Correct-Knowledge -Correction $Content -OldId $Id
    }
    "status" {
        Initialize-MemoryBank
        Write-Host "MEMORY STATUS" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        foreach ($file in (Get-ChildItem -Path $KnowledgeDir -Filter "*.jsonl")) {
            $count = (Get-Content $file.FullName | Where-Object { $_ -and $_.Trim() }).Count
            $name = $file.BaseName
            Write-Host "$name : $count entries"
        }
    }
    default {
        Write-Host "Usage: .\memory.ps1 {remember|recall|correct|status} [args]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  remember <content> [-Type fact|decision|error|preference] [-Tags tag1,tag2]"
        Write-Host "  recall <query> [-Type fact|decision|error|preference] [-Limit N]"
        Write-Host "  correct <content> -Id <uuid>"
        Write-Host "  status"
        exit 1
    }
}
