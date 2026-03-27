import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listInstalledPacks,
  loadPackRules,
  loadMatrix,
  loadPackMetadata,
  extractQueryKeywords,
  scoreRule,
  searchRules,
  getRuleById,
  explainTopic,
  validateFile,
  generateDomainPrd,
  computeStaleness,
  getAllRuleStaleness,
  formatPackList,
  formatExplainResponse,
  formatSearchResults,
  formatStalenessSummary,
  formatViolations,
  formatMatrixData,
} from '../core/domain-engine.js';
import type { DomainRule } from '../core/domain-engine.js';

let tmpDir: string;

function makePackDir(name: string, rules: any[], matrices?: Record<string, any>) {
  const packDir = join(tmpDir, 'packs', name);
  mkdirSync(packDir, { recursive: true });

  writeFileSync(join(packDir, 'pack.json'), JSON.stringify({
    name,
    version: '1.0.0',
    title: `Test ${name} pack`,
    description: `Test pack for ${name}`,
    jurisdiction: ['EU'],
    industries: ['test'],
    rule_count: rules.length,
    matrix_count: matrices ? Object.keys(matrices).length : 0,
    example_count: 0,
    last_updated: '2026-01-01',
    disclaimer: 'Test disclaimer',
  }));

  writeFileSync(join(packDir, 'rules.jsonl'), rules.map((r) => JSON.stringify(r)).join('\n'));

  if (matrices) {
    mkdirSync(join(packDir, 'matrices'), { recursive: true });
    for (const [mName, mData] of Object.entries(matrices)) {
      writeFileSync(join(packDir, 'matrices', `${mName}.json`), JSON.stringify(mData));
    }
  }
}

const sampleRule: DomainRule = {
  id: 'TEST-001',
  domain: 'test',
  category: 'rates',
  title: 'Test VAT rule',
  rule: 'Standard VAT rate must be at least 15%',
  details: 'Details about the rule',
  jurisdiction: 'EU',
  exceptions: ['Exception 1'],
  formula: 'net * rate = vat',
  effective_date: '2020-01-01',
  source: 'Test Directive',
  source_url: 'https://example.com',
  confidence: 'legislation',
  tags: ['vat', 'rates', 'standard-rate'],
  last_verified: '2026-01-01',
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'domain-'));
  mkdirSync(join(tmpDir, 'packs'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('listInstalledPacks', () => {
  it('returns empty for no packs', () => {
    expect(listInstalledPacks(tmpDir)).toHaveLength(0);
  });

  it('lists installed packs', () => {
    makePackDir('eu-vat', [sampleRule]);
    const packs = listInstalledPacks(tmpDir);
    expect(packs).toHaveLength(1);
    expect(packs[0].metadata.name).toBe('eu-vat');
    expect(packs[0].ruleCount).toBe(1);
  });

  it('handles multiple packs', () => {
    makePackDir('eu-vat', [sampleRule]);
    makePackDir('gdpr', [{ ...sampleRule, id: 'GDPR-001', domain: 'gdpr' }]);
    expect(listInstalledPacks(tmpDir)).toHaveLength(2);
  });
});

describe('loadPackRules', () => {
  it('loads rules from JSONL', () => {
    makePackDir('test', [sampleRule, { ...sampleRule, id: 'TEST-002' }]);
    const packPath = join(tmpDir, 'packs', 'test');
    const rules = loadPackRules(packPath);
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe('TEST-001');
  });

  it('returns empty for missing file', () => {
    expect(loadPackRules('/nonexistent')).toHaveLength(0);
  });
});

describe('loadMatrix', () => {
  it('loads matrix data', () => {
    const matrixData = {
      name: 'Standard Rates',
      description: 'test',
      headers: ['Country', 'Rate'],
      rows: [{ Country: 'LU', Rate: '17%' }],
      source: 'test',
      last_updated: '2026-01-01',
    };
    makePackDir('test', [], { 'standard-rates': matrixData });
    const matrix = loadMatrix(join(tmpDir, 'packs', 'test'), 'standard-rates');
    expect(matrix).not.toBeNull();
    expect(matrix!.rows).toHaveLength(1);
  });

  it('returns null for missing matrix', () => {
    expect(loadMatrix('/nonexistent', 'x')).toBeNull();
  });
});

describe('loadPackMetadata', () => {
  it('loads metadata', () => {
    makePackDir('test', []);
    const meta = loadPackMetadata(join(tmpDir, 'packs', 'test'));
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('test');
  });
});

describe('extractQueryKeywords', () => {
  it('removes stop words', () => {
    const kw = extractQueryKeywords('what is the VAT rate for Luxembourg');
    expect(kw).toContain('vat');
    expect(kw).toContain('rate');
    expect(kw).toContain('luxembourg');
    expect(kw).not.toContain('the');
  });

  it('handles empty string', () => {
    expect(extractQueryKeywords('')).toHaveLength(0);
  });
});

describe('scoreRule', () => {
  it('scores higher for title match', () => {
    const titleScore = scoreRule(sampleRule, ['vat']);
    const detailScore = scoreRule(sampleRule, ['details']);
    expect(titleScore).toBeGreaterThan(detailScore);
  });

  it('scores highest for ID match', () => {
    const score = scoreRule(sampleRule, ['test-001']);
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it('returns 0 for no match', () => {
    expect(scoreRule(sampleRule, ['cryptocurrency'])).toBe(0);
  });
});

describe('searchRules', () => {
  it('finds matching rules', () => {
    makePackDir('eu-vat', [sampleRule]);
    const results = searchRules(tmpDir, 'VAT rate');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rule.id).toBe('TEST-001');
  });

  it('filters by pack', () => {
    makePackDir('eu-vat', [sampleRule]);
    makePackDir('gdpr', [{ ...sampleRule, id: 'GDPR-001', domain: 'gdpr', tags: ['gdpr'] }]);
    const results = searchRules(tmpDir, 'rate', 'eu-vat');
    expect(results.every((r) => r.pack === 'eu-vat')).toBe(true);
  });

  it('returns empty for no match', () => {
    makePackDir('eu-vat', [sampleRule]);
    expect(searchRules(tmpDir, 'cryptocurrency exchange')).toHaveLength(0);
  });
});

describe('getRuleById', () => {
  it('finds rule by exact ID', () => {
    makePackDir('eu-vat', [sampleRule]);
    const result = getRuleById(tmpDir, 'TEST-001');
    expect(result).not.toBeNull();
    expect(result!.rule.title).toContain('Test VAT');
  });

  it('returns null for unknown ID', () => {
    makePackDir('eu-vat', [sampleRule]);
    expect(getRuleById(tmpDir, 'NONEXISTENT')).toBeNull();
  });
});

describe('explainTopic', () => {
  it('returns matching rules with disclaimer', () => {
    makePackDir('eu-vat', [sampleRule]);
    const response = explainTopic(tmpDir, 'VAT standard rate');
    expect(response.rules.length).toBeGreaterThan(0);
    expect(response.disclaimer).toContain('reference only');
  });

  it('returns empty for no match', () => {
    makePackDir('eu-vat', [sampleRule]);
    const response = explainTopic(tmpDir, 'blockchain mining');
    expect(response.rules).toHaveLength(0);
  });
});

describe('validateFile', () => {
  it('detects hardcoded VAT rates', () => {
    const filePath = join(tmpDir, 'vat-calc.ts');
    writeFileSync(filePath, 'const vatRate = 0.21; // 21% VAT rate');
    makePackDir('eu-vat', [sampleRule]);
    const violations = validateFile(tmpDir, filePath, 'eu-vat');
    expect(violations.some((v) => v.title.includes('Hardcoded VAT rate'))).toBe(true);
  });

  it('returns empty for clean code', () => {
    const filePath = join(tmpDir, 'app.ts');
    writeFileSync(filePath, 'const x = 1;');
    makePackDir('eu-vat', [sampleRule]);
    expect(validateFile(tmpDir, filePath, 'eu-vat')).toHaveLength(0);
  });

  it('returns empty for unknown pack', () => {
    const filePath = join(tmpDir, 'app.ts');
    writeFileSync(filePath, 'code');
    expect(validateFile(tmpDir, filePath, 'nonexistent')).toHaveLength(0);
  });
});

describe('generateDomainPrd', () => {
  it('generates PRD with regulatory requirements', () => {
    makePackDir('eu-vat', [sampleRule]);
    const prd = generateDomainPrd(tmpDir, 'VAT calculator for EU');
    expect(prd).toContain('PRD');
    expect(prd).toContain('Regulatory Requirements');
    expect(prd).toContain('TEST-001');
  });

  it('generates PRD without rules when no match', () => {
    makePackDir('eu-vat', [sampleRule]);
    const prd = generateDomainPrd(tmpDir, 'mobile game');
    expect(prd).toContain('PRD');
    expect(prd).not.toContain('Regulatory Requirements');
  });
});

describe('formatPackList', () => {
  it('formats pack list', () => {
    makePackDir('eu-vat', [sampleRule]);
    const packs = listInstalledPacks(tmpDir);
    const output = formatPackList(packs);
    expect(output).toContain('eu-vat');
    expect(output).toContain('v1.0.0');
  });

  it('handles empty', () => {
    expect(formatPackList([])).toContain('No industry packs');
  });
});

describe('formatExplainResponse', () => {
  it('formats with rules', () => {
    makePackDir('eu-vat', [sampleRule]);
    const response = explainTopic(tmpDir, 'VAT rate');
    const output = formatExplainResponse(response);
    expect(output).toContain('TEST-001');
    expect(output).toContain('reference only');
  });

  it('handles no results', () => {
    const output = formatExplainResponse({ topic: 'x', rules: [], disclaimer: 'disc', pack: 'none' });
    expect(output).toContain('No rules found');
  });
});

describe('formatSearchResults', () => {
  it('formats results', () => {
    makePackDir('eu-vat', [sampleRule]);
    const results = searchRules(tmpDir, 'VAT');
    const output = formatSearchResults(results);
    expect(output).toContain('TEST-001');
  });

  it('handles empty', () => {
    expect(formatSearchResults([])).toContain('No matching');
  });
});

describe('formatViolations', () => {
  it('formats violations', () => {
    const violations = [{
      rule_id: 'TEST-001', severity: 'high' as const, title: 'Hardcoded rate',
      description: 'Found hardcoded rate', file: 'vat.ts', regulation: 'Directive', recommendation: 'Use config',
    }];
    const output = formatViolations(violations);
    expect(output).toContain('Hardcoded rate');
    expect(output).toContain('TEST-001');
  });

  it('handles empty', () => {
    expect(formatViolations([])).toContain('No domain violations');
  });
});

describe('formatMatrixData', () => {
  it('formats matrix', () => {
    const matrix = {
      name: 'Rates', description: 'test', headers: ['Country', 'Rate'],
      rows: [{ Country: 'LU', Rate: '17%' }], source: 'test', last_updated: '2026-01-01',
    };
    const output = formatMatrixData(matrix);
    expect(output).toContain('LU');
    expect(output).toContain('17%');
  });
});

// ── Integration with real eu-vat pack ───────────────────────────

describe('real eu-vat pack', () => {
  const realFrameworkDir = join(__dirname, '..', '..', '..');

  it('loads the installed eu-vat pack', () => {
    const packs = listInstalledPacks(realFrameworkDir);
    const euVat = packs.find((p) => p.metadata.name === 'eu-vat');
    if (!euVat) return; // skip if pack not installed
    expect(euVat.ruleCount).toBeGreaterThan(10);
  });

  it('searches for Luxembourg VAT', () => {
    const results = searchRules(realFrameworkDir, 'Luxembourg VAT rate');
    if (results.length === 0) return; // skip if pack not installed
    expect(results.some((r) => r.rule.jurisdiction === 'LU')).toBe(true);
  });

  it('loads standard-rates matrix', () => {
    const packs = listInstalledPacks(realFrameworkDir);
    const euVat = packs.find((p) => p.metadata.name === 'eu-vat');
    if (!euVat) return;
    const matrix = loadMatrix(euVat.path, 'standard-rates');
    expect(matrix).not.toBeNull();
    expect(matrix!.rows.length).toBe(27);
  });
});

// ── Staleness Detection (Story 4.1) ─────────────────────────────

describe('computeStaleness', () => {
  it('returns current for recent dates', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 30);
    const result = computeStaleness(recent.toISOString().slice(0, 10));
    expect(result.level).toBe('current');
    expect(result.daysSince).toBeLessThan(180);
  });

  it('returns stale for 6-12 month old dates', () => {
    const stale = new Date();
    stale.setMonth(stale.getMonth() - 8);
    const result = computeStaleness(stale.toISOString().slice(0, 10));
    expect(result.level).toBe('stale');
  });

  it('returns outdated for >12 month old dates', () => {
    const outdated = new Date();
    outdated.setFullYear(outdated.getFullYear() - 2);
    const result = computeStaleness(outdated.toISOString().slice(0, 10));
    expect(result.level).toBe('outdated');
    expect(result.daysSince).toBeGreaterThan(365);
  });
});

describe('getAllRuleStaleness', () => {
  it('returns staleness info for all pack rules', () => {
    makePackDir('test-pack', [
      { id: 'T-001', domain: 'test', category: 'general', title: 'Recent rule', rule: 'r', details: 'd', jurisdiction: 'US', exceptions: [], formula: null, effective_date: '2026-01-01', source: 's', source_url: '', confidence: 'legislation', tags: [], last_verified: new Date().toISOString().slice(0, 10) },
      { id: 'T-002', domain: 'test', category: 'general', title: 'Old rule', rule: 'r', details: 'd', jurisdiction: 'US', exceptions: [], formula: null, effective_date: '2024-01-01', source: 's', source_url: '', confidence: 'legislation', tags: [], last_verified: '2024-01-01' },
    ]);
    const results = getAllRuleStaleness(tmpDir);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.rule.id === 'T-001')!.level).toBe('current');
    expect(results.find((r) => r.rule.id === 'T-002')!.level).toBe('outdated');
  });
});

describe('formatStalenessSummary', () => {
  it('includes staleness counts per pack', () => {
    makePackDir('test-pack', [
      { id: 'T-001', domain: 'test', category: 'general', title: 'Rule', rule: 'r', details: 'd', jurisdiction: 'US', exceptions: [], formula: null, effective_date: '2026-01-01', source: 's', source_url: '', confidence: 'legislation', tags: [], last_verified: '2024-01-01' },
    ]);
    const output = formatStalenessSummary(tmpDir);
    expect(output).toContain('test-pack');
    expect(output).toContain('Outdated');
  });
});
