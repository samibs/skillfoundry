// Team router: keyword-based agent selection from an active team roster.
// No LLM calls — pure regex scoring. Deterministic and fast.

import { getAgent } from './agent-registry.js';

export interface RoutingKeyword {
  pattern: RegExp;
  weight: number;
}

export interface RoutingResult {
  agent: string;
  displayName: string;
  score: number;
  confidence: 'high' | 'medium' | 'low' | 'fallback';
}

// Keyword map: each agent maps to weighted patterns.
// Higher weight = stronger signal the message belongs to this agent.
export const AGENT_ROUTING_KEYWORDS: Record<string, RoutingKeyword[]> = {
  coder: [
    { pattern: /\b(implement|code|write|create|add|build|scaffold)\b/i, weight: 3 },
    { pattern: /\b(function|class|module|component|feature|method)\b/i, weight: 2 },
    { pattern: /\b(refactor|clean\s*up|rewrite)\b/i, weight: 1 },
  ],
  tester: [
    { pattern: /\b(tests?|specs?|coverage|assert|expect|vitest|jest|mocha|pytest)\b/i, weight: 3 },
    { pattern: /\b(unit\s*tests?|integration\s*tests?|e2e|end.to.end)\b/i, weight: 4 },
    { pattern: /\b(TDD|test.driven|mock|stub)\b/i, weight: 3 },
  ],
  fixer: [
    { pattern: /\b(fix|bug|broken|error|crash|issue|regression|failing)\b/i, weight: 3 },
    { pattern: /\b(patch|hotfix|workaround)\b/i, weight: 2 },
  ],
  review: [
    { pattern: /\b(review|audit|inspect|evaluate)\b/i, weight: 4 },
    { pattern: /\b(check)\b/i, weight: 2 },
    { pattern: /\b(code\s*review|PR|pull\s*request|merge\s*request)\b/i, weight: 4 },
    { pattern: /\b(quality|smell|anti.?pattern|feedback|critique)\b/i, weight: 2 },
  ],
  debugger: [
    { pattern: /\b(debug|trace|stack\s*trace|breakpoint|log)\b/i, weight: 3 },
    { pattern: /\b(diagnos|root\s*cause|reproduce)\b/i, weight: 3 },
  ],
  architect: [
    { pattern: /\b(architect|design|system\s*design|decompos)\b/i, weight: 3 },
    { pattern: /\b(pattern|structure|layer|module\s*boundary|diagram)\b/i, weight: 2 },
  ],
  'api-design': [
    { pattern: /\b(api|endpoint|REST|GraphQL|OpenAPI|swagger)\b/i, weight: 3 },
    { pattern: /\b(route|handler|controller|request|response)\b/i, weight: 2 },
  ],
  'data-architect': [
    { pattern: /\b(schema|database|migration|table|column|index)\b/i, weight: 3 },
    { pattern: /\b(SQL|query|constraint|foreign\s*key|relation)\b/i, weight: 3 },
  ],
  'ux-ui': [
    { pattern: /\b(UI|UX|interface|layout|CSS|style|theme)\b/i, weight: 3 },
    { pattern: /\b(responsive|mobile|dark\s*mode|design\s*system)\b/i, weight: 2 },
    { pattern: /\b(button|form|modal|dropdown|navigation)\b/i, weight: 2 },
  ],
  docs: [
    { pattern: /\b(document|readme|guide|tutorial|api\s*doc)\b/i, weight: 3 },
    { pattern: /\b(jsdoc|tsdoc|comment|changelog)\b/i, weight: 2 },
  ],
  security: [
    { pattern: /\b(security|vulnerability|CVE|OWASP|XSS|CSRF|injection)\b/i, weight: 3 },
    { pattern: /\b(auth|token|credential|encrypt|hash|salt)\b/i, weight: 2 },
  ],
  'security-scanner': [
    { pattern: /\b(scan|secret|leak|credential\s*exposure|banned\s*pattern)\b/i, weight: 3 },
  ],
  'gate-keeper': [
    { pattern: /\b(gate|block|reject|quality\s*gate|enforce)\b/i, weight: 3 },
    { pattern: /\b(compliance|pass|fail)\b/i, weight: 2 },
  ],
  evaluator: [
    { pattern: /\b(evaluate|assess|grade|score|rate)\b/i, weight: 3 },
  ],
  standards: [
    { pattern: /\b(standard|convention|best\s*practice|lint|format)\b/i, weight: 3 },
    { pattern: /\b(adherence|conformance)\b/i, weight: 2 },
  ],
  accessibility: [
    { pattern: /\b(a11y|accessibility|WCAG|aria|screen\s*reader)\b/i, weight: 3 },
    { pattern: /\b(contrast|keyboard\s*nav|focus\s*trap)\b/i, weight: 2 },
  ],
  devops: [
    { pattern: /\b(CI|CD|pipeline|deploy|docker|kubernetes|terraform)\b/i, weight: 3 },
    { pattern: /\b(container|infrastructure|DevOps|build\s*pipeline)\b/i, weight: 2 },
  ],
  sre: [
    { pattern: /\b(SRE|uptime|latency|SLA|SLO|error\s*budget|incident)\b/i, weight: 3 },
    { pattern: /\b(monitor|alert|on.?call|pager)\b/i, weight: 2 },
  ],
  ops: [
    { pattern: /\b(ops|script|automat|cron|job)\b/i, weight: 3 },
    { pattern: /\b(tooling|generator|operational)\b/i, weight: 2 },
  ],
  health: [
    { pattern: /\b(health|diagnostic|status\s*check)\b/i, weight: 2 },
  ],
  performance: [
    { pattern: /\b(performance|speed|bottleneck|profile|optimize|benchmark)\b/i, weight: 3 },
    { pattern: /\b(memory\s*leak|CPU|latency|throughput)\b/i, weight: 2 },
  ],
  metrics: [
    { pattern: /\b(metric|dashboard|usage|statistic|analytics)\b/i, weight: 3 },
  ],
  release: [
    { pattern: /\b(release|version|changelog|tag|bump)\b/i, weight: 3 },
  ],
  ship: [
    { pattern: /\b(ship|publish|production|pre.?release)\b/i, weight: 3 },
    { pattern: /\b(deploy|push\s*to\s*prod)\b/i, weight: 2 },
  ],
  anvil: [
    { pattern: /\b(anvil|quality\s*gate|six.?tier)\b/i, weight: 3 },
    { pattern: /\b(validate|enforce)\b/i, weight: 1 },
  ],
  dependency: [
    { pattern: /\b(dependency|package|npm|yarn|outdated|upgrade)\b/i, weight: 3 },
  ],
  migration: [
    { pattern: /\b(migrat|upgrade|convert|port)\b/i, weight: 3 },
  ],
  'tech-lead': [
    { pattern: /\b(tech\s*lead|priorit|roadmap|decision)\b/i, weight: 3 },
    { pattern: /\b(trade.?off|scope|estimate)\b/i, weight: 2 },
  ],
  'senior-engineer': [
    { pattern: /\b(senior|mentor|best\s*approach|how\s*should)\b/i, weight: 2 },
  ],
  i18n: [
    { pattern: /\b(i18n|translat|locale|internationali)\b/i, weight: 3 },
  ],
  memory: [
    { pattern: /\b(memory|knowledge|recall|lesson)\b/i, weight: 3 },
  ],
  prd: [
    { pattern: /\b(prd|requirement|product\s*spec|user\s*story)\b/i, weight: 3 },
  ],
  stories: [
    { pattern: /\b(story|stories|epic|backlog)\b/i, weight: 3 },
  ],
};

export function routeToAgent(
  message: string,
  teamMembers: string[],
  defaultAgent: string,
): RoutingResult {
  let bestAgent = defaultAgent;
  let bestScore = 0;

  for (const member of teamMembers) {
    const keywords = AGENT_ROUTING_KEYWORDS[member];
    if (!keywords) continue;

    let score = 0;
    for (const kw of keywords) {
      if (kw.pattern.test(message)) {
        score += kw.weight;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = member;
    }
    // Tie-break: earlier in members array wins (no change needed, first found keeps lead)
  }

  let confidence: RoutingResult['confidence'];
  if (bestScore >= 6) confidence = 'high';
  else if (bestScore >= 3) confidence = 'medium';
  else if (bestScore >= 1) confidence = 'low';
  else confidence = 'fallback';

  const agentDef = getAgent(bestAgent);
  return {
    agent: bestAgent,
    displayName: agentDef?.displayName || bestAgent,
    score: bestScore,
    confidence,
  };
}
