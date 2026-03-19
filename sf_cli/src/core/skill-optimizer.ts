/**
 * Skill Optimizer — Autoresearch-inspired mutation loop for agent prompts.
 *
 * Pattern: mutate prompt → evaluate → compare → keep or revert → iterate.
 *
 * Uses deterministic mutation strategies (no LLM calls) to optimize
 * agent skill prompts based on structural prompt engineering principles.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import type Database from 'better-sqlite3';

// ── Types ───────────────────────────────────────────────────────

export interface Section {
  heading: string;
  body: string;
}

export interface SkillFile {
  frontmatter: string;
  body: string;
  path: string;
}

export interface MutationResult {
  mutated: string;
  description: string;
  strategy: string;
}

export interface MutationStrategy {
  name: string;
  description: string;
  apply: (body: string, rng?: () => number) => MutationResult | null;
}

export interface GateResult {
  gate: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  detail?: string;
}

export interface IterationResult {
  iteration: number;
  strategy: string;
  mutationDetail: string;
  gateResults: GateResult[];
  gatePassCount: number;
  gateFailCount: number;
  durationMs: number;
  tokenEstimate: number;
  compositeScore: number;
  kept: boolean;
  promptHash: string;
}

export interface OptimizationConfig {
  skillPath: string;
  scenario: string;
  maxIterations: number;
  timeBudgetMs: number;
  strategies?: string[];
  dryRun?: boolean;
}

export interface ExperimentResult {
  experimentId: string;
  skillName: string;
  totalIterations: number;
  baseline: IterationResult;
  best: IterationResult;
  iterations: IterationResult[];
  improvementPct: number;
  strategyWins: Record<string, number>;
  strategyLosses: Record<string, number>;
  durationMs: number;
  bestPrompt: string;
}

export interface OptimizationExperimentRecord {
  id: string;
  skill_name: string;
  scenario_description: string;
  started_at: string;
  completed_at?: string;
  total_iterations: number;
  best_iteration: number;
  baseline_score: number;
  best_score: number;
  improvement_pct: number;
  status: string;
  config?: string;
}

export interface OptimizationIterationRecord {
  id?: number;
  experiment_id: string;
  iteration_number: number;
  mutation_strategy: string;
  mutation_detail?: string;
  gate_verdict?: string;
  gate_pass_count: number;
  gate_fail_count: number;
  duration_ms: number;
  token_estimate: number;
  composite_score: number;
  kept: number;
  prompt_hash?: string;
}

// ── Constants ───────────────────────────────────────────────────

const LINE = '\u2501';

// ── Skill File Parser ───────────────────────────────────────────

/**
 * Parse a skill file into frontmatter and body.
 */
export function parseSkillFile(filePath: string): SkillFile {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    return { frontmatter: match[1], body: match[2], path: filePath };
  }
  return { frontmatter: '', body: content, path: filePath };
}

/**
 * Reassemble a skill file from frontmatter and body.
 */
export function reassembleSkillFile(skill: SkillFile): string {
  if (skill.frontmatter) {
    return `---\n${skill.frontmatter}\n---\n${skill.body}`;
  }
  return skill.body;
}

// ── Section Parser ──────────────────────────────────────────────

/**
 * Split a markdown body into sections delimited by ## headings.
 */
export function parseSections(body: string): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let currentHeading = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n') });
      }
      currentHeading = line;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  if (currentHeading || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n') });
  }

  return sections;
}

/**
 * Reassemble sections into a markdown body.
 */
export function reassembleSections(sections: Section[]): string {
  return sections
    .map((s) => (s.heading ? `${s.heading}\n${s.body}` : s.body))
    .join('\n');
}

// ── Scoring ─────────────────────────────────────────────────────

/**
 * Compute a composite score from gate results, duration, and token count.
 * Score range: 0.0 to 1.0 (higher is better).
 *
 * Weights: gate quality 70%, duration efficiency 15%, token efficiency 15%.
 */
export function computeCompositeScore(
  gateResults: GateResult[],
  durationMs: number,
  tokenEstimate: number,
): number {
  const scorable = gateResults.filter((g) => g.status !== 'skip');
  const gateScore =
    scorable.length === 0
      ? 0
      : scorable.reduce((sum, g) => {
          if (g.status === 'pass') return sum + 1.0;
          if (g.status === 'warn') return sum + 0.5;
          return sum;
        }, 0) / scorable.length;

  const durationPenalty = Math.min(durationMs / 300_000, 1.0);
  const tokenPenalty = Math.min(tokenEstimate / 50_000, 1.0);

  return gateScore * 0.7 + (1 - durationPenalty) * 0.15 + (1 - tokenPenalty) * 0.15;
}

/**
 * Estimate token count from text (chars / 4 approximation).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Simple hash for prompt content (for dedup/tracking).
 */
export function hashPrompt(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ── Mutation Strategies ─────────────────────────────────────────

/**
 * Strategy 1: Swap two non-first ## sections.
 */
export const reorderSections: MutationStrategy = {
  name: 'reorder_sections',
  description: 'Swap two non-first sections to test attention ordering effects',
  apply(body: string, rng = Math.random): MutationResult | null {
    const sections = parseSections(body);
    if (sections.length < 3) return null;

    // Pick two distinct non-first indices
    const indices = Array.from({ length: sections.length - 1 }, (_, i) => i + 1);
    const i = indices[Math.floor(rng() * indices.length)];
    let j = indices[Math.floor(rng() * indices.length)];
    if (i === j) j = indices[(indices.indexOf(j) + 1) % indices.length];
    if (i === j) return null;

    const swapped = [...sections];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];

    return {
      mutated: reassembleSections(swapped),
      description: `Swapped sections "${sections[i].heading}" and "${sections[j].heading}"`,
      strategy: 'reorder_sections',
    };
  },
};

/**
 * Strategy 2: Toggle bold emphasis on instruction keywords.
 */
export const toggleEmphasis: MutationStrategy = {
  name: 'toggle_emphasis',
  description: 'Add or remove bold markers on instruction keywords',
  apply(body: string): MutationResult | null {
    const keywords = ['MUST', 'NEVER', 'ALWAYS', 'CRITICAL', 'MANDATORY', 'REQUIRED'];
    let mutated = body;
    let changes = 0;

    for (const kw of keywords) {
      const boldPattern = new RegExp(`\\*\\*${kw}\\*\\*`, 'g');
      const plainPattern = new RegExp(`(?<!\\*)\\b${kw}\\b(?!\\*)`, 'g');

      if (boldPattern.test(mutated)) {
        mutated = mutated.replace(boldPattern, kw);
        changes++;
      } else if (plainPattern.test(mutated)) {
        mutated = mutated.replace(plainPattern, `**${kw}**`);
        changes++;
      }
    }

    if (changes === 0) return null;
    return {
      mutated,
      description: `Toggled emphasis on ${changes} keywords`,
      strategy: 'toggle_emphasis',
    };
  },
};

/**
 * Strategy 3: Convert bullet list to numbered list or vice versa.
 */
export const listTypeSwap: MutationStrategy = {
  name: 'list_type_swap',
  description: 'Convert bullet lists to numbered or vice versa (ordering vs equal weight)',
  apply(body: string): MutationResult | null {
    const bulletPattern = /^- .+$/gm;
    const numberedPattern = /^\d+\. .+$/gm;

    const bulletMatches = body.match(bulletPattern);
    const numberedMatches = body.match(numberedPattern);

    let mutated = body;
    let desc = '';

    if (bulletMatches && bulletMatches.length >= 3) {
      let counter = 1;
      mutated = body.replace(bulletPattern, (match) => {
        return `${counter++}. ${match.slice(2)}`;
      });
      desc = `Converted ${bulletMatches.length} bullet items to numbered list`;
    } else if (numberedMatches && numberedMatches.length >= 3) {
      mutated = body.replace(numberedPattern, (match) => {
        return `- ${match.replace(/^\d+\. /, '')}`;
      });
      desc = `Converted ${numberedMatches.length} numbered items to bullet list`;
    } else {
      return null;
    }

    return { mutated, description: desc, strategy: 'list_type_swap' };
  },
};

/**
 * Strategy 4: Replace passive/hedging with direct imperatives.
 */
export const sharpenInstructions: MutationStrategy = {
  name: 'sharpen_instructions',
  description: 'Replace passive voice and hedging with direct imperatives',
  apply(body: string): MutationResult | null {
    const replacements: [RegExp, string][] = [
      [/\bshould be (\w+ed)\b/gi, '$1'],
      [/\bconsider (\w+ing)\b/gi, '$1'],
      [/\byou may want to\b/gi, ''],
      [/\bit is recommended to\b/gi, ''],
      [/\bplease ensure that\b/gi, 'ensure'],
      [/\btry to\b/gi, ''],
      [/\bif possible,?\s*/gi, ''],
    ];

    let mutated = body;
    let changes = 0;

    for (const [pattern, replacement] of replacements) {
      const before = mutated;
      mutated = mutated.replace(pattern, replacement);
      if (mutated !== before) changes++;
    }

    if (changes === 0) return null;
    return {
      mutated,
      description: `Sharpened ${changes} hedging/passive patterns to imperatives`,
      strategy: 'sharpen_instructions',
    };
  },
};

/**
 * Strategy 5: Remove optional/supplementary sections (Examples, Notes, References).
 */
export const toggleOptionalSection: MutationStrategy = {
  name: 'toggle_optional_section',
  description: 'Remove or restore optional sections (examples, notes, references)',
  apply(body: string, rng = Math.random): MutationResult | null {
    const optionalKeywords = ['Example', 'Reference', 'Note', 'Commentary', 'Tip', 'Hint', 'See also'];
    const sections = parseSections(body);

    const optionalIndices = sections
      .map((s, i) => ({ section: s, index: i }))
      .filter(
        ({ section, index }) =>
          index > 0 && optionalKeywords.some((kw) => section.heading.includes(kw)),
      )
      .map(({ index }) => index);

    if (optionalIndices.length === 0) return null;

    const removeIdx = optionalIndices[Math.floor(rng() * optionalIndices.length)];
    const removed = sections[removeIdx];
    const filtered = sections.filter((_, i) => i !== removeIdx);

    return {
      mutated: reassembleSections(filtered),
      description: `Removed optional section "${removed.heading}"`,
      strategy: 'toggle_optional_section',
    };
  },
};

/**
 * Strategy 6: Consolidate multiple constraint lists into one.
 */
export const consolidateConstraints: MutationStrategy = {
  name: 'consolidate_constraints',
  description: 'Merge multiple short constraint sections into one unified list',
  apply(body: string): MutationResult | null {
    const constraintKeywords = ['Constraint', 'Rule', 'Requirement', 'Restriction', 'Limitation'];
    const sections = parseSections(body);

    const constraintIndices = sections
      .map((s, i) => ({ section: s, index: i }))
      .filter(
        ({ section, index }) =>
          index > 0 && constraintKeywords.some((kw) => section.heading.includes(kw)),
      )
      .map(({ index }) => index);

    if (constraintIndices.length < 2) return null;

    const mergedBody = constraintIndices
      .map((i) => `### ${sections[i].heading.replace(/^##\s*/, '')}\n${sections[i].body}`)
      .join('\n\n');

    const merged: Section = {
      heading: '## Constraints & Rules',
      body: '\n' + mergedBody,
    };

    const filtered = sections.filter((_, i) => !constraintIndices.includes(i));
    filtered.splice(constraintIndices[0], 0, merged);

    return {
      mutated: reassembleSections(filtered),
      description: `Consolidated ${constraintIndices.length} constraint sections into one`,
      strategy: 'consolidate_constraints',
    };
  },
};

/**
 * Strategy 7: Swap bullet-to-prose for the first suitable section.
 */
export const formatSwap: MutationStrategy = {
  name: 'format_swap',
  description: 'Convert a bullet list to prose paragraph or vice versa',
  apply(body: string): MutationResult | null {
    const sections = parseSections(body);

    for (let i = 1; i < sections.length; i++) {
      const lines = sections[i].body.split('\n').filter((l) => l.startsWith('- '));
      if (lines.length >= 3 && lines.length <= 8) {
        const prose = lines.map((l) => l.slice(2).replace(/\.$/, '')).join('; ') + '.';
        const updated = [...sections];
        updated[i] = {
          heading: sections[i].heading,
          body: sections[i].body.replace(
            lines.map((l) => l).join('\n'),
            '\n' + prose + '\n',
          ),
        };
        return {
          mutated: reassembleSections(updated),
          description: `Converted ${lines.length}-item bullet list to prose in "${sections[i].heading}"`,
          strategy: 'format_swap',
        };
      }
    }

    return null;
  },
};

/**
 * Strategy 8: Remove redundant sentences.
 */
export const pruneRedundancy: MutationStrategy = {
  name: 'prune_redundancy',
  description: 'Remove sentences that repeat the same concept',
  apply(body: string): MutationResult | null {
    const sentences = body.match(/[^.!?\n]+[.!?]/g);
    if (!sentences || sentences.length < 5) return null;

    const normalized = sentences.map((s) => s.toLowerCase().trim().replace(/\s+/g, ' '));
    const toRemove = new Set<number>();

    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        if (toRemove.has(j)) continue;
        const shorter = normalized[i].length < normalized[j].length ? i : j;
        const longer = shorter === i ? j : i;
        if (normalized[longer].includes(normalized[shorter]) && normalized[shorter].length > 20) {
          toRemove.add(shorter);
        }
      }
    }

    if (toRemove.size === 0) return null;

    let mutated = body;
    const removedSentences = [...toRemove].map((i) => sentences[i].trim());
    for (const s of removedSentences) {
      mutated = mutated.replace(s, '');
    }
    mutated = mutated.replace(/\n{3,}/g, '\n\n');

    return {
      mutated,
      description: `Pruned ${toRemove.size} redundant sentence(s)`,
      strategy: 'prune_redundancy',
    };
  },
};

// ── Strategy Registry ───────────────────────────────────────────

export function getAllStrategies(): MutationStrategy[] {
  return [
    reorderSections,
    toggleEmphasis,
    listTypeSwap,
    sharpenInstructions,
    toggleOptionalSection,
    consolidateConstraints,
    formatSwap,
    pruneRedundancy,
  ];
}

export function getStrategyByName(name: string): MutationStrategy | undefined {
  return getAllStrategies().find((s) => s.name === name);
}

// ── Experiment Runner ───────────────────────────────────────────

/**
 * Simulate gate evaluation for a skill prompt.
 * In production this would invoke the real Anvil gates.
 * For now, it evaluates structural quality heuristics.
 */
export function evaluateSkillPrompt(body: string): GateResult[] {
  const results: GateResult[] = [];

  // T1: Structure — has sections, frontmatter refs, clear layout
  const sections = parseSections(body);
  results.push({
    gate: 'T1-structure',
    status: sections.length >= 3 ? 'pass' : sections.length >= 2 ? 'warn' : 'fail',
    detail: `${sections.length} sections`,
  });

  // T2: Clarity — no hedging, direct imperatives
  const hedgingCount = (body.match(/\b(should|could|might|maybe|perhaps|consider)\b/gi) || []).length;
  results.push({
    gate: 'T2-clarity',
    status: hedgingCount <= 3 ? 'pass' : hedgingCount <= 8 ? 'warn' : 'fail',
    detail: `${hedgingCount} hedging words`,
  });

  // T3: Completeness — has security, error handling, validation mentions
  const hasSecurityRef = /security|auth|xss|injection|csrf/i.test(body);
  const hasErrorRef = /error|exception|fail|invalid|reject/i.test(body);
  const hasValidationRef = /validat|sanitiz|check|verify/i.test(body);
  const completeness = [hasSecurityRef, hasErrorRef, hasValidationRef].filter(Boolean).length;
  results.push({
    gate: 'T3-completeness',
    status: completeness >= 3 ? 'pass' : completeness >= 2 ? 'warn' : 'fail',
    detail: `${completeness}/3 coverage areas`,
  });

  // T4: Conciseness — token efficiency
  const tokens = estimateTokens(body);
  results.push({
    gate: 'T4-conciseness',
    status: tokens <= 3000 ? 'pass' : tokens <= 6000 ? 'warn' : 'fail',
    detail: `~${tokens} tokens`,
  });

  // T5: Specificity — has code examples or patterns
  const hasExamples = /```|`[^`]+`/.test(body);
  const hasPatterns = /pattern|example|template/i.test(body);
  results.push({
    gate: 'T5-specificity',
    status: hasExamples ? 'pass' : hasPatterns ? 'warn' : 'fail',
    detail: hasExamples ? 'has code examples' : hasPatterns ? 'has pattern refs' : 'no examples',
  });

  // T6: Actionability — uses imperative verbs
  const imperatives = (body.match(/\b(DO|REJECT|VALIDATE|CHECK|ENSURE|IMPLEMENT|NEVER|ALWAYS)\b/g) || []).length;
  results.push({
    gate: 'T6-actionability',
    status: imperatives >= 5 ? 'pass' : imperatives >= 2 ? 'warn' : 'fail',
    detail: `${imperatives} directive verbs`,
  });

  return results;
}

/**
 * Run a full optimization experiment on a skill file.
 */
export function runExperiment(config: OptimizationConfig): ExperimentResult {
  const log = getLogger();
  const experimentId = randomUUID();
  const startTime = Date.now();
  const skill = parseSkillFile(config.skillPath);
  const skillName = skill.frontmatter.match(/name:\s*(.+)/)?.[1]?.trim() || 'unknown';

  const strategies = config.strategies
    ? getAllStrategies().filter((s) => config.strategies!.includes(s.name))
    : getAllStrategies();

  // Baseline
  const baselineGates = evaluateSkillPrompt(skill.body);
  const baselineTokens = estimateTokens(skill.body);
  const baselineScore = computeCompositeScore(baselineGates, 0, baselineTokens);
  const baseline: IterationResult = {
    iteration: 0,
    strategy: 'baseline',
    mutationDetail: 'Original prompt',
    gateResults: baselineGates,
    gatePassCount: baselineGates.filter((g) => g.status === 'pass').length,
    gateFailCount: baselineGates.filter((g) => g.status === 'fail').length,
    durationMs: 0,
    tokenEstimate: baselineTokens,
    compositeScore: baselineScore,
    kept: true,
    promptHash: hashPrompt(skill.body),
  };

  let currentBest = baseline;
  let currentBody = skill.body;
  const iterations: IterationResult[] = [];
  const strategyWins: Record<string, number> = {};
  const strategyLosses: Record<string, number> = {};

  for (let i = 1; i <= config.maxIterations; i++) {
    if (Date.now() - startTime > config.timeBudgetMs) break;

    const strategy = strategies[(i - 1) % strategies.length];
    const iterStart = Date.now();
    const mutation = strategy.apply(currentBody);

    if (!mutation) {
      iterations.push({
        iteration: i,
        strategy: strategy.name,
        mutationDetail: 'Not applicable',
        gateResults: [],
        gatePassCount: 0,
        gateFailCount: 0,
        durationMs: Date.now() - iterStart,
        tokenEstimate: 0,
        compositeScore: currentBest.compositeScore,
        kept: false,
        promptHash: '',
      });
      continue;
    }

    const gates = evaluateSkillPrompt(mutation.mutated);
    const tokens = estimateTokens(mutation.mutated);
    const iterDuration = Date.now() - iterStart;
    const score = computeCompositeScore(gates, iterDuration, tokens);
    const kept = score >= currentBest.compositeScore;

    if (kept) {
      currentBody = mutation.mutated;
      strategyWins[strategy.name] = (strategyWins[strategy.name] || 0) + 1;
    } else {
      strategyLosses[strategy.name] = (strategyLosses[strategy.name] || 0) + 1;
    }

    const result: IterationResult = {
      iteration: i,
      strategy: strategy.name,
      mutationDetail: mutation.description,
      gateResults: gates,
      gatePassCount: gates.filter((g) => g.status === 'pass').length,
      gateFailCount: gates.filter((g) => g.status === 'fail').length,
      durationMs: iterDuration,
      tokenEstimate: tokens,
      compositeScore: score,
      kept,
      promptHash: hashPrompt(mutation.mutated),
    };

    iterations.push(result);
    if (kept) currentBest = result;
  }

  const totalDuration = Date.now() - startTime;
  const improvementPct =
    baseline.compositeScore > 0
      ? ((currentBest.compositeScore - baseline.compositeScore) / baseline.compositeScore) * 100
      : 0;

  return {
    experimentId,
    skillName,
    totalIterations: iterations.length,
    baseline,
    best: currentBest,
    iterations,
    improvementPct,
    strategyWins,
    strategyLosses,
    durationMs: totalDuration,
    bestPrompt: currentBody,
  };
}

// ── Database Persistence ────────────────────────────────────────

export function insertExperiment(db: Database.Database, record: OptimizationExperimentRecord): void {
  db.prepare(`
    INSERT INTO optimization_experiments
      (id, skill_name, scenario_description, started_at, completed_at,
       total_iterations, best_iteration, baseline_score, best_score,
       improvement_pct, status, config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.skill_name, record.scenario_description,
    record.started_at, record.completed_at,
    record.total_iterations, record.best_iteration,
    record.baseline_score, record.best_score,
    record.improvement_pct, record.status, record.config,
  );
}

export function insertIteration(db: Database.Database, record: OptimizationIterationRecord): void {
  db.prepare(`
    INSERT INTO optimization_iterations
      (experiment_id, iteration_number, mutation_strategy, mutation_detail,
       gate_verdict, gate_pass_count, gate_fail_count, duration_ms,
       token_estimate, composite_score, kept, prompt_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.experiment_id, record.iteration_number,
    record.mutation_strategy, record.mutation_detail,
    record.gate_verdict, record.gate_pass_count, record.gate_fail_count,
    record.duration_ms, record.token_estimate,
    record.composite_score, record.kept, record.prompt_hash,
  );
}

export function getExperimentResults(db: Database.Database, experimentId: string): {
  experiment: OptimizationExperimentRecord;
  iterations: OptimizationIterationRecord[];
} | null {
  const experiment = db.prepare(
    'SELECT * FROM optimization_experiments WHERE id = ?',
  ).get(experimentId) as OptimizationExperimentRecord | undefined;
  if (!experiment) return null;

  const iterations = db.prepare(
    'SELECT * FROM optimization_iterations WHERE experiment_id = ? ORDER BY iteration_number',
  ).all(experimentId) as OptimizationIterationRecord[];

  return { experiment, iterations };
}

export function getRecentExperiments(db: Database.Database, limit = 10): OptimizationExperimentRecord[] {
  return db.prepare(
    'SELECT * FROM optimization_experiments ORDER BY started_at DESC LIMIT ?',
  ).all(limit) as OptimizationExperimentRecord[];
}

/**
 * Persist a full experiment result to the database.
 */
export function persistExperiment(db: Database.Database, result: ExperimentResult, scenario: string): void {
  insertExperiment(db, {
    id: result.experimentId,
    skill_name: result.skillName,
    scenario_description: scenario.substring(0, 500),
    started_at: new Date(Date.now() - result.durationMs).toISOString(),
    completed_at: new Date().toISOString(),
    total_iterations: result.totalIterations,
    best_iteration: result.best.iteration,
    baseline_score: result.baseline.compositeScore,
    best_score: result.best.compositeScore,
    improvement_pct: result.improvementPct,
    status: 'completed',
    config: JSON.stringify({ maxIterations: result.totalIterations }),
  });

  for (const iter of result.iterations) {
    const gateVerdict = iter.gateResults.length > 0
      ? iter.gateResults.map((g) => `${g.gate}:${g.status}`).join(',')
      : 'n/a';
    insertIteration(db, {
      experiment_id: result.experimentId,
      iteration_number: iter.iteration,
      mutation_strategy: iter.strategy,
      mutation_detail: iter.mutationDetail,
      gate_verdict: gateVerdict,
      gate_pass_count: iter.gatePassCount,
      gate_fail_count: iter.gateFailCount,
      duration_ms: iter.durationMs,
      token_estimate: iter.tokenEstimate,
      composite_score: iter.compositeScore,
      kept: iter.kept ? 1 : 0,
      prompt_hash: iter.promptHash,
    });
  }
}

// ── Report Formatting ───────────────────────────────────────────

export function formatExperimentReport(result: ExperimentResult): string {
  const lines: string[] = [];
  lines.push(`Skill Optimizer — ${result.skillName}`);
  lines.push(LINE.repeat(60));
  lines.push(`  Experiment: ${result.experimentId.slice(0, 8)}`);
  lines.push(`  Iterations: ${result.totalIterations} | Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push('');

  // Baseline
  const bGates = result.baseline.gateResults.map((g) => `${g.gate.split('-')[0]}:${g.status}`).join(' ');
  lines.push(`  Baseline:  ${result.baseline.compositeScore.toFixed(3)} (${bGates})`);
  lines.push('');

  // Iterations
  for (const iter of result.iterations) {
    const scoreDelta = iter.compositeScore - result.baseline.compositeScore;
    const deltaStr =
      scoreDelta > 0
        ? `+${(scoreDelta * 100).toFixed(0)}%`
        : scoreDelta < 0
          ? `${(scoreDelta * 100).toFixed(0)}%`
          : '=';
    const status = iter.kept ? 'KEEP' : iter.mutationDetail === 'Not applicable' ? 'N/A' : 'SKIP';
    const stratName = iter.strategy.padEnd(25);
    lines.push(
      `  ${String(iter.iteration).padStart(2)}. ${stratName} ${iter.compositeScore.toFixed(3)} (${deltaStr.padStart(5)}) ${status}`,
    );
  }

  lines.push('');
  lines.push(`  Best score: ${result.best.compositeScore.toFixed(3)} (${result.improvementPct >= 0 ? '+' : ''}${result.improvementPct.toFixed(1)}% vs baseline)`);

  // Strategy summary
  const allStrats = new Set([
    ...Object.keys(result.strategyWins),
    ...Object.keys(result.strategyLosses),
  ]);
  if (allStrats.size > 0) {
    lines.push('');
    lines.push('  Strategy results:');
    for (const s of allStrats) {
      const wins = result.strategyWins[s] || 0;
      const losses = result.strategyLosses[s] || 0;
      lines.push(`    ${s}: ${wins}W / ${losses}L`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function formatStrategyList(): string {
  const strategies = getAllStrategies();
  const lines = [
    'Available Mutation Strategies',
    LINE.repeat(60),
    '',
  ];
  for (const s of strategies) {
    lines.push(`  ${s.name.padEnd(28)} ${s.description}`);
  }
  lines.push('');
  return lines.join('\n');
}
