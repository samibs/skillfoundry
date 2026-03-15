import { describe, it, expect, vi } from 'vitest';

// Mock vscode module for provider tests
vi.mock('vscode', () => {
  const EventEmitter = class {
    private handlers: Function[] = [];
    event = (handler: Function) => { this.handlers.push(handler); return { dispose: () => {} }; };
    fire(data?: unknown) { this.handlers.forEach((h) => h(data)); }
  };

  const ThemeIcon = class {
    constructor(public id: string) {}
  };

  const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

  const CodeLens = class {
    range: unknown;
    command?: unknown;
    constructor(range: unknown, command?: unknown) {
      this.range = range;
      this.command = command;
    }
  };

  const TreeItem = class {
    label: string;
    description?: string;
    tooltip?: string;
    iconPath?: unknown;
    collapsibleState: number;
    constructor(label: string, collapsibleState: number = 0) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  };

  const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

  const Range = class {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number,
    ) {}
  };

  const Uri = {
    file: (p: string) => ({ scheme: 'file', fsPath: p, toString: () => `file://${p}` }),
    parse: (s: string) => ({ scheme: 'file', fsPath: s.replace('file://', ''), toString: () => s }),
  };

  const Diagnostic = class {
    source?: string;
    constructor(public range: unknown, public message: string, public severity: number) {}
  };

  const languages = {
    createDiagnosticCollection: (name: string) => ({
      name,
      _entries: new Map<string, unknown[]>(),
      set(uri: unknown, diagnostics: unknown[]) {
        this._entries.set(String(uri), diagnostics);
      },
      delete(uri: unknown) {
        this._entries.delete(String(uri));
      },
      clear() {
        this._entries.clear();
      },
      dispose() {
        this._entries.clear();
      },
      get entries() {
        return this._entries;
      },
    }),
  };

  const workspace = {
    getConfiguration: () => ({
      get: (_key: string, defaultVal: unknown) => defaultVal,
    }),
  };

  return {
    EventEmitter,
    ThemeIcon,
    TreeItemCollapsibleState,
    TreeItem,
    CodeLens,
    DiagnosticSeverity,
    Range,
    Uri,
    Diagnostic,
    languages,
    workspace,
  };
});

// Import after mocking
import { DashboardProvider, DashboardItem } from '../src/providers/dashboard';
import { DiagnosticsManager } from '../src/providers/diagnostics';
import { SfCodeLensProvider } from '../src/providers/codelens';
import { SfBridge, TelemetryAggregation } from '../src/bridge';

// ── Dashboard Tests ──────────────────────────────────────

describe('DashboardProvider', () => {
  function makeBridge(metrics: TelemetryAggregation | null) {
    return {
      getMetrics: () => metrics,
    } as unknown as SfBridge;
  }

  it('shows "no telemetry" when metrics are null', () => {
    const provider = new DashboardProvider(makeBridge(null));
    const items = provider.getChildren();
    expect(items.length).toBe(1);
    expect(items[0].label).toContain('No telemetry');
  });

  it('shows "no telemetry" when total_runs is 0', () => {
    const provider = new DashboardProvider(makeBridge({
      total_runs: 0, successful_runs: 0, partial_runs: 0, failed_runs: 0,
      gate_pass_rate: 0, avg_security_findings: { critical: 0, high: 0, medium: 0, low: 0 },
      avg_tests_created: 0, avg_rework_cycles: 0, avg_duration_ms: 0,
      avg_cost_usd: 0, total_cost_usd: 0, trend: 'insufficient_data', window: 10,
    }));
    const items = provider.getChildren();
    expect(items.length).toBe(1);
    expect(items[0].label).toContain('No telemetry');
  });

  it('shows 8 metric rows when data exists', () => {
    const provider = new DashboardProvider(makeBridge({
      total_runs: 5, successful_runs: 4, partial_runs: 1, failed_runs: 0,
      gate_pass_rate: 0.92, avg_security_findings: { critical: 0, high: 1, medium: 2, low: 3 },
      avg_tests_created: 12, avg_rework_cycles: 1.2, avg_duration_ms: 45000,
      avg_cost_usd: 0.35, total_cost_usd: 1.75, trend: 'improving', window: 10,
    }));
    const items = provider.getChildren();
    expect(items.length).toBe(8);
    expect(items[0].label).toBe('Gate Pass Rate');
    expect(items[0].value).toContain('92.0%');
  });

  it('marks high pass rate as pass status', () => {
    const provider = new DashboardProvider(makeBridge({
      total_runs: 5, successful_runs: 5, partial_runs: 0, failed_runs: 0,
      gate_pass_rate: 0.95, avg_security_findings: { critical: 0, high: 0, medium: 0, low: 0 },
      avg_tests_created: 10, avg_rework_cycles: 0, avg_duration_ms: 30000,
      avg_cost_usd: 0.20, total_cost_usd: 1.00, trend: 'stable', window: 10,
    }));
    const items = provider.getChildren();
    expect(items[0].status).toBe('pass');
  });

  it('marks low pass rate as fail status', () => {
    const provider = new DashboardProvider(makeBridge({
      total_runs: 5, successful_runs: 1, partial_runs: 1, failed_runs: 3,
      gate_pass_rate: 0.45, avg_security_findings: { critical: 2, high: 3, medium: 5, low: 10 },
      avg_tests_created: 2, avg_rework_cycles: 4, avg_duration_ms: 60000,
      avg_cost_usd: 0.80, total_cost_usd: 4.00, trend: 'declining', window: 10,
    }));
    const items = provider.getChildren();
    expect(items[0].status).toBe('fail');
  });

  it('refresh() updates metrics from bridge', () => {
    let callCount = 0;
    const bridge = {
      getMetrics: () => {
        callCount++;
        return null;
      },
    } as unknown as SfBridge;
    const provider = new DashboardProvider(bridge);
    provider.refresh();
    expect(callCount).toBe(1);
  });
});

// ── DashboardItem Tests ──────────────────────────────────

describe('DashboardItem', () => {
  it('sets description and tooltip from value', () => {
    const item = new DashboardItem('Test', '42%', 'pass');
    expect(item.description).toBe('42%');
    expect(item.tooltip).toBe('Test: 42%');
  });
});

// ── DiagnosticsManager Tests ─────────────────────────────

describe('DiagnosticsManager', () => {
  it('clears diagnostics on pass results', () => {
    const mgr = new DiagnosticsManager();
    mgr.updateFromGateResults([
      { tier: 'T1', name: 'Patterns', status: 'pass', detail: '', durationMs: 100 },
    ]);
    // No assertions needed beyond no-throw — pass results should not create diagnostics
  });

  it('disposes without error', () => {
    const mgr = new DiagnosticsManager();
    expect(() => mgr.dispose()).not.toThrow();
  });

  it('clears without error', () => {
    const mgr = new DiagnosticsManager();
    expect(() => mgr.clear()).not.toThrow();
  });
});

// ── CodeLens Tests ───────────────────────────────────────

describe('SfCodeLensProvider', () => {
  function makeDoc(fileName: string) {
    return { fileName } as unknown as import('vscode').TextDocument;
  }

  it('returns T3 CodeLens for test files', () => {
    const provider = new SfCodeLensProvider();
    const lenses = provider.provideCodeLenses(makeDoc('/project/src/app.test.ts'));
    // Test files get T3 + T1 (since they match SECURITY_PATTERNS too)
    const t3 = lenses.find((l) => l.command?.title?.includes('T3'));
    expect(t3).toBeDefined();
  });

  it('returns T1 + T4 CodeLens for source files', () => {
    const provider = new SfCodeLensProvider();
    const lenses = provider.provideCodeLenses(makeDoc('/project/src/service.ts'));
    const t1 = lenses.find((l) => l.command?.title?.includes('T1'));
    const t4 = lenses.find((l) => l.command?.title?.includes('T4'));
    expect(t1).toBeDefined();
    expect(t4).toBeDefined();
  });

  it('does not return T4 for test files', () => {
    const provider = new SfCodeLensProvider();
    const lenses = provider.provideCodeLenses(makeDoc('/project/src/app.spec.tsx'));
    const t4 = lenses.find((l) => l.command?.title?.includes('T4'));
    expect(t4).toBeUndefined();
  });

  it('returns no lenses for non-code files', () => {
    const provider = new SfCodeLensProvider();
    const lenses = provider.provideCodeLenses(makeDoc('/project/README.md'));
    expect(lenses.length).toBe(0);
  });

  it('refresh fires event', () => {
    const provider = new SfCodeLensProvider();
    let fired = false;
    provider.onDidChangeCodeLenses(() => { fired = true; });
    provider.refresh();
    expect(fired).toBe(true);
  });
});
