// Output compressor — reduces tool output tokens before they reach the LLM context.
// Pure functions, regex-based detection, <1ms overhead. No AI calls.
// Ordered: more specific patterns first.
const COMMAND_PATTERNS = [
    { pattern: /\bgit\s+status\b/, type: 'git-status' },
    { pattern: /\bgit\s+log\b/, type: 'git-log' },
    { pattern: /\bgit\s+diff\b/, type: 'git-diff' },
    { pattern: /\bgit\s+(push|pull|add|commit|fetch|checkout|merge|rebase|stash|branch|tag|reset|restore|switch|cherry-pick)\b/, type: 'git-oneshot' },
    { pattern: /\b(vitest|jest|mocha|pytest|cargo\s+test|go\s+test|npm\s+test|npx\s+test|pnpm\s+test|bun\s+test)\b/, type: 'test-runner' },
    { pattern: /\b(tsc|eslint|biome|prettier|ruff|clippy|golangci-lint)\b/, type: 'build-lint' },
    { pattern: /\b(npm\s+install|pnpm\s+(install|add)|yarn\s+(install|add)?|pip\s+install|cargo\s+build)\b/, type: 'pkg-install' },
    { pattern: /\b(docker\s+(ps|images|logs|compose)|kubectl\s+(get|logs|describe))\b/, type: 'docker' },
];
// Minimum output size to bother compressing (bytes). Small outputs pass through.
const MIN_COMPRESS_SIZE = 200;
/**
 * Detect command type from command string.
 * For chained commands (&&, ||, ;), checks each segment.
 */
export function detectCommandType(command) {
    // Split on chain operators and check each segment
    const segments = command.split(/\s*(?:&&|\|\||;)\s*/);
    // Check the last segment first (its output is most relevant), then others
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i].trim();
        for (const { pattern, type } of COMMAND_PATTERNS) {
            if (pattern.test(seg))
                return type;
        }
    }
    return 'default';
}
// ────────────────────────────────────────────────────────────────
// Git compressors
// ────────────────────────────────────────────────────────────────
export function compressGitStatus(output) {
    const lines = output.split('\n');
    const result = [];
    for (const line of lines) {
        // Skip hint lines: "  (use "git ..." to ...)"
        if (/^\s*\(use "git\s/.test(line))
            continue;
        // Skip empty lines
        if (line.trim() === '')
            continue;
        // Skip section headers — they add noise, the status prefix tells the story
        if (/^(Changes to be committed|Changes not staged|Untracked files|On branch|Your branch|no changes added)/.test(line)) {
            // Keep "On branch" and "Your branch" — useful context
            if (/^(On branch|Your branch)/.test(line)) {
                result.push(line.trim());
            }
            continue;
        }
        // Keep file status lines (indented with tab or whitespace + status indicator)
        result.push(line.trimEnd());
    }
    return result.join('\n') || output;
}
export function compressGitOneshot(command, output) {
    // For commands whose verbose output is irrelevant — reduce to one-liners.
    const lines = output.split('\n').filter((l) => l.trim() !== '');
    if (/\bgit\s+push\b/.test(command)) {
        // Extract "abc..def branch -> branch" or "Everything up-to-date"
        const summary = lines.find((l) => /->|up-to-date|rejected|error/i.test(l));
        const branch = lines.find((l) => /\s+->\s+/.test(l));
        if (branch) {
            const match = branch.match(/([a-f0-9]+)\.\.([a-f0-9]+)\s+(\S+)\s+->/);
            if (match)
                return `ok ${match[3]} ${match[1]}..${match[2]}`;
        }
        return summary?.trim() || (lines.length > 0 ? lines[lines.length - 1].trim() : output);
    }
    if (/\bgit\s+pull\b/.test(command)) {
        const upToDate = lines.find((l) => /Already up[- ]to[- ]date/i.test(l));
        if (upToDate)
            return 'Already up to date';
        const summary = lines.find((l) => /files?\s+changed/i.test(l));
        return summary?.trim() || (lines.length > 0 ? lines[lines.length - 1].trim() : output);
    }
    if (/\bgit\s+commit\b/.test(command)) {
        // Extract "[branch hash] message"
        const commitLine = lines.find((l) => /^\[/.test(l.trim()));
        return commitLine?.trim() || (lines.length > 0 ? lines[lines.length - 1].trim() : output);
    }
    if (/\bgit\s+add\b/.test(command)) {
        // git add produces no output on success
        return output.trim() || 'ok';
    }
    if (/\bgit\s+fetch\b/.test(command)) {
        if (!output.trim())
            return 'ok (no new objects)';
        // Keep lines showing new refs
        const refs = lines.filter((l) => /->/.test(l) || /new\s+(branch|tag)/i.test(l));
        return refs.length > 0 ? refs.join('\n') : lines[lines.length - 1].trim();
    }
    if (/\bgit\s+(checkout|switch)\b/.test(command)) {
        const switched = lines.find((l) => /Switched to|Already on|Your branch/i.test(l));
        return switched?.trim() || (lines.length > 0 ? lines[lines.length - 1].trim() : output);
    }
    if (/\bgit\s+merge\b/.test(command)) {
        const upToDate = lines.find((l) => /Already up[- ]to[- ]date/i.test(l));
        if (upToDate)
            return 'Already up to date';
        const summary = lines.find((l) => /files?\s+changed|Fast-forward|Merge made/i.test(l));
        return summary?.trim() || (lines.length > 0 ? lines[lines.length - 1].trim() : output);
    }
    if (/\bgit\s+stash\b/.test(command)) {
        return lines.length > 0 ? lines[0].trim() : output;
    }
    // Generic: return last meaningful line
    return lines.length > 0 ? lines[lines.length - 1].trim() : output;
}
export function compressGitLog(output) {
    const lines = output.split('\n');
    const commits = [];
    let currentHash = '';
    let currentMsg = '';
    for (const line of lines) {
        const hashMatch = line.match(/^commit\s+([a-f0-9]{7,})/);
        if (hashMatch) {
            if (currentHash && currentMsg) {
                commits.push(`${currentHash.slice(0, 7)} ${currentMsg}`);
            }
            currentHash = hashMatch[1];
            currentMsg = '';
            continue;
        }
        // Skip Author:, Date:, Merge: lines
        if (/^\s*(Author|Date|Merge):/i.test(line))
            continue;
        // First non-empty content line after commit header = message
        if (currentHash && !currentMsg && line.trim()) {
            currentMsg = line.trim();
        }
    }
    // Flush last commit
    if (currentHash && currentMsg) {
        commits.push(`${currentHash.slice(0, 7)} ${currentMsg}`);
    }
    return commits.length > 0 ? commits.join('\n') : output;
}
export function compressGitDiff(output, isError) {
    if (isError)
        return output; // Keep full context on error
    const lines = output.split('\n');
    const result = [];
    let unchangedRun = 0;
    for (const line of lines) {
        // Strip noise metadata lines
        if (/^(index |mode |old mode |new mode |similarity index |rename (from|to) |copy (from|to) )/.test(line))
            continue;
        // Track runs of unchanged context lines (lines starting with space, not +/-)
        if (line.startsWith(' ') && !line.startsWith('--- ') && !line.startsWith('+++ ')) {
            unchangedRun++;
            if (unchangedRun <= 2) {
                result.push(line);
            }
            else if (unchangedRun === 3) {
                result.push('  ...');
            }
            // Skip further unchanged lines
            continue;
        }
        // Reset unchanged counter on change/header lines
        if (unchangedRun > 3) {
            result[result.length - 1] = `  ... (${unchangedRun - 2} unchanged lines)`;
        }
        unchangedRun = 0;
        result.push(line);
    }
    // Flush trailing unchanged
    if (unchangedRun > 3) {
        result[result.length - 1] = `  ... (${unchangedRun - 2} unchanged lines)`;
    }
    return result.join('\n');
}
// ────────────────────────────────────────────────────────────────
// Test runner compressor
// ────────────────────────────────────────────────────────────────
export function compressTestRunner(output, isError) {
    const lines = output.split('\n');
    if (!isError) {
        // All tests passed — extract only the summary line
        const summaryLines = lines.filter((l) => /Tests?:?\s+\d+|tests?\s+passed|PASS|passed|ok\s+\(/i.test(l) ||
            /^={3,}\s+.*\s+={3,}$/.test(l) || // pytest summary bars
            /Test Suites?:/i.test(l) ||
            /^Tests:\s/.test(l.trim()));
        if (summaryLines.length > 0) {
            return summaryLines.map((l) => l.trim()).join('\n');
        }
        // Fallback: count lines with "pass" or "ok", report count
        const passCount = lines.filter((l) => /\bpass(ed)?\b|\bok\b/i.test(l)).length;
        if (passCount > 0)
            return `All tests passed (${passCount} results)`;
        return output;
    }
    // Tests failed — keep failure blocks, strip passing tests
    const result = [];
    let inFailBlock = false;
    let blankCount = 0;
    for (const line of lines) {
        // Detect fail block start
        if (/FAIL|FAILED|--- FAIL|✗|✕|×|AssertionError|Error:|panic/i.test(line)) {
            inFailBlock = true;
        }
        // Detect pass lines — skip them (unless in a fail block)
        if (!inFailBlock && /^\s*(✓|✔|√)\s/.test(line)) {
            continue;
        }
        if (!inFailBlock && /^\s*(PASS|--- PASS:)\s/i.test(line)) {
            continue;
        }
        // Summary lines — always keep
        if (/Tests?:?\s+\d+|Test Suites?:|={3,}|Ran \d+ test|FAILED|failures?:/i.test(line)) {
            inFailBlock = false;
            result.push(line);
            continue;
        }
        if (inFailBlock) {
            // End fail block on pass lines — don't include them
            if (/^\s*(✓|✔|√)\s/.test(line) || /^\s*(PASS|--- PASS:)\s/i.test(line)) {
                inFailBlock = false;
                continue;
            }
            result.push(line);
            blankCount = line.trim() === '' ? blankCount + 1 : 0;
            // End fail block after 2+ consecutive blanks
            if (blankCount >= 2)
                inFailBlock = false;
            continue;
        }
        // Keep non-test output that's not a pass line (e.g., build output, warnings)
        if (line.trim() !== '' && !/^\s*(✓|✔|PASS|--- PASS|ok\s+\d|√)/i.test(line)) {
            // Heuristic: skip "running N tests" type lines
            if (/^running \d+ tests?$/i.test(line.trim()))
                continue;
            if (/^test result:/i.test(line.trim())) {
                result.push(line);
                continue;
            }
            // Skip verbose test names from passing tests
            if (/test\s+\S+\s+\.\.\.\s+ok$/i.test(line.trim()))
                continue;
            result.push(line);
        }
    }
    return result.join('\n') || output;
}
// ────────────────────────────────────────────────────────────────
// Build/lint compressor
// ────────────────────────────────────────────────────────────────
export function compressBuildLint(output) {
    const lines = output.split('\n');
    // Try to group by file. Pattern: "file:line:col: message" or "file(line,col): message"
    const fileErrors = new Map();
    const otherLines = [];
    for (const line of lines) {
        if (line.trim() === '')
            continue;
        // Match "file:line:col: ..." or "file(line,col): ..."
        const match = line.match(/^(.+?):(\d+)(?::\d+)?:\s*(.+)$/) ||
            line.match(/^(.+?)\((\d+),\d+\):\s*(.+)$/);
        if (match) {
            const [, file, lineNum, msg] = match;
            const key = file.trim();
            if (!fileErrors.has(key))
                fileErrors.set(key, new Map());
            const msgs = fileErrors.get(key);
            const msgKey = msg.trim();
            msgs.set(msgKey, (msgs.get(msgKey) || 0) + 1);
        }
        else {
            // Keep summary/header lines
            otherLines.push(line);
        }
    }
    if (fileErrors.size === 0)
        return output;
    const result = [];
    for (const [file, msgs] of fileErrors) {
        const totalErrors = Array.from(msgs.values()).reduce((a, b) => a + b, 0);
        result.push(`${file} (${totalErrors} issue${totalErrors > 1 ? 's' : ''}):`);
        for (const [msg, count] of msgs) {
            result.push(`  ${msg}${count > 1 ? ` (x${count})` : ''}`);
        }
    }
    // Append relevant summary lines (e.g., "Found X errors")
    const summaryLines = otherLines.filter((l) => /error|warning|found|total|failed|\d+\s+(issue|problem)/i.test(l));
    if (summaryLines.length > 0) {
        result.push('');
        result.push(...summaryLines);
    }
    return result.join('\n');
}
// ────────────────────────────────────────────────────────────────
// Package install compressor
// ────────────────────────────────────────────────────────────────
export function compressPkgInstall(output) {
    const lines = output.split('\n');
    const result = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        // Skip progress indicators
        if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(trimmed))
            continue;
        if (/^\[={2,}|^#{2,}\s|^\|={2,}/.test(trimmed))
            continue;
        if (/^\d+%\s/.test(trimmed))
            continue;
        if (/^(Downloading|Resolving|Linking|Progress|Fetching)[\s:]/i.test(trimmed))
            continue;
        // Skip npm warn (keep npm ERR!)
        if (/^npm\s+warn\b/i.test(trimmed))
            continue;
        // Keep summary lines and errors
        if (/added|removed|audited|up to date|packages?\s+in|found\s+\d+\s+vulnerabilit|npm\s+err/i.test(trimmed) ||
            /Successfully installed|Requirement already satisfied|error/i.test(trimmed)) {
            result.push(trimmed);
            continue;
        }
        // Keep cargo build summaries
        if (/Compiling|Finished|warning:|error\[/i.test(trimmed)) {
            result.push(trimmed);
            continue;
        }
    }
    return result.length > 0 ? result.join('\n') : output;
}
// ────────────────────────────────────────────────────────────────
// Docker/kubectl compressor
// ────────────────────────────────────────────────────────────────
export function compressDocker(output) {
    const lines = output.split('\n');
    // For logs: deduplicate
    if (lines.length > 20) {
        return collapseRepeatedLines(output);
    }
    // For ps/images: compact table — keep header + data, trim whitespace runs
    const result = [];
    for (const line of lines) {
        if (line.trim() === '')
            continue;
        // Collapse multiple whitespace to single space for table rows
        result.push(line.replace(/\s{2,}/g, '  ').trimEnd());
    }
    return result.join('\n');
}
// ────────────────────────────────────────────────────────────────
// Generic log deduplication
// ────────────────────────────────────────────────────────────────
export function collapseRepeatedLines(output) {
    const lines = output.split('\n');
    if (lines.length < 5)
        return output;
    const result = [];
    let prevLine = '';
    let repeatCount = 0;
    for (const line of lines) {
        // Normalize for comparison: strip timestamps and leading whitespace
        const normalized = line.replace(/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[.\d]*[Z]?\s*/, '').trim();
        const prevNormalized = prevLine.replace(/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[.\d]*[Z]?\s*/, '').trim();
        if (normalized === prevNormalized && normalized !== '') {
            repeatCount++;
        }
        else {
            if (repeatCount >= 2) {
                result.push(`  ... (repeated ${repeatCount + 1} times)`);
            }
            else if (repeatCount === 1) {
                result.push(prevLine); // Show both if only 1 repeat
            }
            result.push(line);
            repeatCount = 0;
        }
        prevLine = line;
    }
    // Flush trailing repeats
    if (repeatCount >= 2) {
        result.push(`  ... (repeated ${repeatCount + 1} times)`);
    }
    else if (repeatCount === 1) {
        result.push(prevLine);
    }
    return result.join('\n');
}
/**
 * Check if output has significant repetition (for log-dedup heuristic).
 */
function hasSignificantRepetition(output) {
    const lines = output.split('\n');
    if (lines.length < 10)
        return false;
    const counts = new Map();
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
    for (const count of counts.values()) {
        if (count >= 3)
            return true;
    }
    return false;
}
// ────────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────────
/**
 * Compress command output based on detected command type.
 * Pure function, no side effects, <1ms for typical outputs.
 */
export function compressOutput(command, rawOutput, isError) {
    const originalBytes = rawOutput.length;
    // Skip compression for small outputs
    if (originalBytes < MIN_COMPRESS_SIZE) {
        return {
            compressed: rawOutput,
            originalBytes,
            compressedBytes: originalBytes,
            type: 'default',
        };
    }
    const type = detectCommandType(command);
    let compressed;
    switch (type) {
        case 'git-status':
            compressed = compressGitStatus(rawOutput);
            break;
        case 'git-log':
            compressed = compressGitLog(rawOutput);
            break;
        case 'git-diff':
            compressed = compressGitDiff(rawOutput, isError);
            break;
        case 'git-oneshot':
            compressed = compressGitOneshot(command, rawOutput);
            break;
        case 'test-runner':
            compressed = compressTestRunner(rawOutput, isError);
            break;
        case 'build-lint':
            compressed = compressBuildLint(rawOutput);
            break;
        case 'pkg-install':
            compressed = compressPkgInstall(rawOutput);
            break;
        case 'docker':
            compressed = compressDocker(rawOutput);
            break;
        default:
            // Check for log-dedup heuristic before falling through
            if (hasSignificantRepetition(rawOutput)) {
                compressed = collapseRepeatedLines(rawOutput);
                return {
                    compressed,
                    originalBytes,
                    compressedBytes: compressed.length,
                    type: 'log-dedup',
                };
            }
            compressed = rawOutput;
            break;
    }
    return {
        compressed,
        originalBytes,
        compressedBytes: compressed.length,
        type,
    };
}
//# sourceMappingURL=output-compressor.js.map