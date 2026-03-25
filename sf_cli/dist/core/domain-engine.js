/**
 * Domain Engine — Industry Knowledge Pack system for domain-specific intelligence.
 *
 * Loads, queries, and validates against structured industry knowledge packs.
 * Each pack contains rules (JSONL), reference docs, matrices, examples, and validators.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// ── Constants ───────────────────────────────────────────────────
const LINE = '\u2501';
const DISCLAIMER = 'This is for development reference only. It does not constitute legal, tax, or financial advice. Always consult qualified professionals for production implementations.';
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'in', 'for', 'on', 'with', 'at',
    'by', 'to', 'of', 'and', 'or', 'not', 'how', 'what', 'does', 'do',
    'this', 'that', 'it', 'be', 'has', 'have', 'from', 'as',
]);
// ── Pack Loading ────────────────────────────────────────────────
/**
 * Get the packs directory path.
 */
export function getPacksDir(frameworkDir) {
    return join(frameworkDir, 'packs');
}
/**
 * List all installed packs.
 */
export function listInstalledPacks(frameworkDir) {
    const packsDir = getPacksDir(frameworkDir);
    if (!existsSync(packsDir))
        return [];
    const packs = [];
    for (const entry of readdirSync(packsDir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const packPath = join(packsDir, entry.name);
        const metaPath = join(packPath, 'pack.json');
        if (!existsSync(metaPath))
            continue;
        try {
            const metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
            const rulesPath = join(packPath, 'rules.jsonl');
            const ruleCount = existsSync(rulesPath)
                ? readFileSync(rulesPath, 'utf-8').split('\n').filter(Boolean).length
                : 0;
            const matricesDir = join(packPath, 'matrices');
            const matrixCount = existsSync(matricesDir)
                ? readdirSync(matricesDir).filter((f) => f.endsWith('.json')).length
                : 0;
            const examplesDir = join(packPath, 'examples');
            const exampleCount = existsSync(examplesDir) ? readdirSync(examplesDir).length : 0;
            packs.push({ metadata, ruleCount, matrixCount, exampleCount, path: packPath });
        }
        catch { /* skip malformed packs */ }
    }
    return packs;
}
/**
 * Load all rules from a pack.
 */
export function loadPackRules(packPath) {
    const rulesPath = join(packPath, 'rules.jsonl');
    if (!existsSync(rulesPath))
        return [];
    return readFileSync(rulesPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
        try {
            return JSON.parse(line);
        }
        catch {
            return null;
        }
    })
        .filter((r) => r !== null);
}
/**
 * Load a specific matrix from a pack.
 */
export function loadMatrix(packPath, matrixName) {
    const matrixPath = join(packPath, 'matrices', `${matrixName}.json`);
    if (!existsSync(matrixPath))
        return null;
    try {
        return JSON.parse(readFileSync(matrixPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
/**
 * Load pack metadata.
 */
export function loadPackMetadata(packPath) {
    const metaPath = join(packPath, 'pack.json');
    if (!existsSync(metaPath))
        return null;
    try {
        return JSON.parse(readFileSync(metaPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
// ── Search ──────────────────────────────────────────────────────
/**
 * Extract search keywords from a query string.
 */
export function extractQueryKeywords(query) {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
/**
 * Score a rule against a search query.
 */
export function scoreRule(rule, keywords) {
    let score = 0;
    const titleLower = rule.title.toLowerCase();
    const ruleLower = rule.rule.toLowerCase();
    const detailsLower = rule.details.toLowerCase();
    const tagsLower = rule.tags.map((t) => t.toLowerCase());
    for (const kw of keywords) {
        if (rule.id.toLowerCase() === kw)
            score += 10;
        if (titleLower.includes(kw))
            score += 8;
        if (tagsLower.includes(kw))
            score += 5;
        if (ruleLower.includes(kw))
            score += 3;
        if (detailsLower.includes(kw))
            score += 1;
    }
    return score;
}
/**
 * Search across all installed packs for rules matching a query.
 */
export function searchRules(frameworkDir, query, packFilter) {
    const keywords = extractQueryKeywords(query);
    if (keywords.length === 0)
        return [];
    const packs = listInstalledPacks(frameworkDir);
    const results = [];
    for (const pack of packs) {
        if (packFilter && pack.metadata.name !== packFilter)
            continue;
        const rules = loadPackRules(pack.path);
        for (const rule of rules) {
            const score = scoreRule(rule, keywords);
            if (score > 0) {
                results.push({ rule, score, pack: pack.metadata.name });
            }
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 10);
}
/**
 * Get a rule by exact ID.
 */
export function getRuleById(frameworkDir, ruleId) {
    const packs = listInstalledPacks(frameworkDir);
    for (const pack of packs) {
        const rules = loadPackRules(pack.path);
        const found = rules.find((r) => r.id === ruleId);
        if (found)
            return { rule: found, pack: pack.metadata.name };
    }
    return null;
}
// ── Explain ─────────────────────────────────────────────────────
/**
 * Explain a topic by finding relevant rules across packs.
 */
export function explainTopic(frameworkDir, topic) {
    const results = searchRules(frameworkDir, topic);
    const packName = results.length > 0 ? results[0].pack : 'none';
    return {
        topic,
        rules: results.map((r) => r.rule),
        disclaimer: DISCLAIMER,
        pack: packName,
    };
}
// ── Validation ──────────────────────────────────────────────────
/**
 * Simple pattern-based domain validation.
 * Each pack can define validation patterns in its rules.
 */
export function validateFile(frameworkDir, filePath, packName) {
    const pack = listInstalledPacks(frameworkDir).find((p) => p.metadata.name === packName);
    if (!pack)
        return [];
    const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    if (!content)
        return [];
    const rules = loadPackRules(pack.path);
    const violations = [];
    // Check for common domain violations based on pack category
    for (const rule of rules) {
        if (!rule.formula && rule.tags.includes('validation-pattern')) {
            // Rules with validation-pattern tag contain regex in their formula field
            // This is extensible — packs define their own validation logic
        }
    }
    // Generic checks based on pack domain
    if (packName === 'eu-vat') {
        // Check for hardcoded VAT rates (should be configurable)
        const vatRatePattern = /(?:vat|tax).*(?:rate|percent).*=\s*(?:0\.\d+|\d{1,2})/gi;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (vatRatePattern.test(lines[i])) {
                violations.push({
                    rule_id: 'EU-VAT-IMPL-001',
                    severity: 'medium',
                    title: 'Hardcoded VAT rate detected',
                    description: `VAT rate appears hardcoded at line ${i + 1}. Rates change per country and over time.`,
                    file: filePath,
                    line: i + 1,
                    regulation: 'Council Directive 2006/112/EC',
                    recommendation: 'Store VAT rates in configuration (database or config file), not in source code. Use the eu-vat/matrices/standard-rates.json as reference.',
                });
            }
        }
        // Check for missing reverse charge handling
        if (/invoice|billing|charge/i.test(content) && !/reverse.?charge/i.test(content)) {
            violations.push({
                rule_id: 'EU-VAT-IMPL-002',
                severity: 'low',
                title: 'No reverse charge handling detected',
                description: 'Billing code found but no reverse charge mechanism for B2B cross-border transactions.',
                file: filePath,
                regulation: 'Council Directive 2006/112/EC, Articles 196-199',
                recommendation: 'Implement reverse charge mechanism for B2B intra-community supplies.',
            });
        }
    }
    if (packName === 'gdpr') {
        const lines = content.split('\n');
        // Check for personal data processing without consent reference
        if (/email|phone|address|name|birth/i.test(content) && !/consent|gdpr|lawful.?basis/i.test(content)) {
            violations.push({
                rule_id: 'GDPR-IMPL-001',
                severity: 'high',
                title: 'Personal data processing without consent reference',
                description: 'Code processes personal data fields but has no reference to consent or lawful basis.',
                file: filePath,
                regulation: 'GDPR Article 6 — Lawfulness of processing',
                recommendation: 'Add consent check or document the lawful basis for processing this personal data.',
            });
        }
        // Check for data retention
        if (/delete|remove|purge|expire/i.test(content) === false && /user|customer|client/i.test(content)) {
            violations.push({
                rule_id: 'GDPR-IMPL-002',
                severity: 'medium',
                title: 'No data retention/deletion mechanism',
                description: 'User data handling found but no deletion or retention logic.',
                file: filePath,
                regulation: 'GDPR Article 17 — Right to erasure',
                recommendation: 'Implement data retention policy with automatic or manual deletion capability.',
            });
        }
    }
    return violations;
}
// ── PRD Generation ──────────────────────────────────────────────
/**
 * Generate a domain-aware PRD from a description.
 */
export function generateDomainPrd(frameworkDir, description) {
    const results = searchRules(frameworkDir, description);
    const date = new Date().toISOString().slice(0, 10);
    const packs = [...new Set(results.map((r) => r.pack))];
    const lines = [];
    lines.push(`# PRD: ${description}`);
    lines.push('');
    lines.push(`**Date**: ${date}`);
    lines.push(`**Domain Packs Referenced**: ${packs.join(', ') || 'none'}`);
    lines.push(`**Generated by**: Industry Knowledge Engine`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Problem Statement');
    lines.push('');
    lines.push(`[Describe the business problem for: ${description}]`);
    lines.push('');
    lines.push('## User Stories');
    lines.push('');
    lines.push('### US-1: Core functionality');
    lines.push('');
    lines.push('**As a** user,');
    lines.push(`**I want to** [core feature from: ${description}],`);
    lines.push('**So that** [business value].');
    lines.push('');
    // Add regulatory requirements from matching rules
    if (results.length > 0) {
        lines.push('## Regulatory Requirements (Auto-populated from Domain Packs)');
        lines.push('');
        lines.push(`> ${DISCLAIMER}`);
        lines.push('');
        const byCategory = new Map();
        for (const r of results.slice(0, 20)) {
            const cat = r.rule.category;
            const group = byCategory.get(cat) || [];
            group.push(r);
            byCategory.set(cat, group);
        }
        for (const [category, catRules] of byCategory) {
            lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
            lines.push('');
            for (const r of catRules) {
                lines.push(`- **${r.rule.id}**: ${r.rule.title} — ${r.rule.rule}`);
                if (r.rule.exceptions.length > 0) {
                    lines.push(`  - Exceptions: ${r.rule.exceptions.join('; ')}`);
                }
                lines.push(`  - Source: ${r.rule.source}`);
            }
            lines.push('');
        }
    }
    lines.push('## Non-Functional Requirements');
    lines.push('');
    lines.push('### Security');
    lines.push('- [ ] All security requirements from CLAUDE.md enforced');
    lines.push('');
    lines.push('### Compliance');
    for (const pack of packs) {
        lines.push(`- [ ] ${pack} pack validation passes (\`/domain validate --pack ${pack}\`)`);
    }
    lines.push('');
    lines.push('## Out of Scope');
    lines.push('');
    lines.push('- Legal review of regulatory compliance (consult qualified professionals)');
    lines.push('- Jurisdiction-specific exceptions not covered by installed packs');
    lines.push('');
    lines.push('## Success Criteria');
    lines.push('');
    lines.push('- [ ] `/certify` returns Grade A');
    for (const pack of packs) {
        lines.push(`- [ ] \`/domain validate --pack ${pack}\` returns zero high/critical violations`);
    }
    lines.push('- [ ] All tests pass');
    lines.push('');
    return lines.join('\n');
}
// ── Formatting ──────────────────────────────────────────────────
export function formatPackList(packs) {
    if (packs.length === 0)
        return '  No industry packs installed.\n  Install one: place pack directory in packs/\n';
    const lines = [
        'Installed Industry Packs',
        LINE.repeat(60),
        '',
    ];
    for (const p of packs) {
        lines.push(`  ${p.metadata.name.padEnd(20)} v${p.metadata.version}  ${p.ruleCount} rules  ${p.matrixCount} matrices  ${p.exampleCount} examples`);
        lines.push(`    ${p.metadata.description}`);
        lines.push(`    Jurisdiction: ${p.metadata.jurisdiction.join(', ')}`);
        lines.push('');
    }
    return lines.join('\n');
}
export function formatExplainResponse(response) {
    if (response.rules.length === 0) {
        return `  No rules found for "${response.topic}".\n  Check installed packs: /domain list\n`;
    }
    const lines = [
        `Domain Knowledge: "${response.topic}"`,
        LINE.repeat(60),
        '',
    ];
    for (const rule of response.rules.slice(0, 5)) {
        lines.push(`  ${rule.id} — ${rule.title}`);
        lines.push(`  ${'\u2500'.repeat(50)}`);
        lines.push(`  Rule: ${rule.rule}`);
        if (rule.details)
            lines.push(`  Details: ${rule.details}`);
        if (rule.exceptions.length > 0) {
            lines.push('  Exceptions:');
            for (const e of rule.exceptions)
                lines.push(`    - ${e}`);
        }
        if (rule.formula)
            lines.push(`  Formula: ${rule.formula}`);
        lines.push(`  Source: ${rule.source}`);
        lines.push(`  Confidence: ${rule.confidence} | Verified: ${rule.last_verified}`);
        lines.push('');
    }
    lines.push(`  ${DISCLAIMER}`);
    lines.push('');
    return lines.join('\n');
}
export function formatSearchResults(results) {
    if (results.length === 0)
        return '  No matching rules found.\n';
    const lines = [
        'Search Results',
        LINE.repeat(60),
        '',
    ];
    for (const r of results) {
        lines.push(`  [${r.pack}] ${r.rule.id}: ${r.rule.title} (score: ${r.score})`);
        lines.push(`    ${r.rule.rule.slice(0, 100)}${r.rule.rule.length > 100 ? '...' : ''}`);
        lines.push('');
    }
    return lines.join('\n');
}
export function formatViolations(violations) {
    if (violations.length === 0)
        return '  No domain violations found.\n';
    const lines = [
        'Domain Validation Results',
        LINE.repeat(60),
        `  Violations: ${violations.length}`,
        '',
    ];
    for (const v of violations) {
        const sev = v.severity === 'critical' ? '\x1b[31mCRIT\x1b[0m' : v.severity === 'high' ? '\x1b[33mHIGH\x1b[0m' : v.severity === 'medium' ? '\x1b[33mMED\x1b[0m' : 'LOW';
        lines.push(`  [${sev}] ${v.rule_id}: ${v.title}`);
        lines.push(`    ${v.description}`);
        if (v.file)
            lines.push(`    File: ${v.file}${v.line ? ':' + v.line : ''}`);
        lines.push(`    Regulation: ${v.regulation}`);
        lines.push(`    Fix: ${v.recommendation}`);
        lines.push('');
    }
    lines.push(`  ${DISCLAIMER}`);
    lines.push('');
    return lines.join('\n');
}
export function formatMatrixData(matrix) {
    if (!matrix)
        return '  Matrix not found.\n';
    const lines = [
        `${matrix.name}`,
        LINE.repeat(60),
        `  ${matrix.description}`,
        `  Source: ${matrix.source} | Updated: ${matrix.last_updated}`,
        '',
    ];
    // Header
    const headerLine = '  ' + matrix.headers.map((h) => h.padEnd(18)).join('');
    lines.push(headerLine);
    lines.push('  ' + '\u2500'.repeat(matrix.headers.length * 18));
    // Rows
    for (const row of matrix.rows) {
        const cells = matrix.headers.map((h) => String(row[h] ?? '').padEnd(18));
        lines.push('  ' + cells.join(''));
    }
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=domain-engine.js.map