import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../core/report-html.js';
import type { TelemetryEvent } from '../core/telemetry.js';
import type { BaselineSnapshot } from '../core/baseline-collector.js';

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    schema_version: 1,
    event_type: 'forge_run',
    timestamp: '2026-03-15T10:00:00.000Z',
    session_id: 'test-session',
    duration_ms: 5000,
    status: 'pass',
    details: {},
    ...overrides,
  };
}

function makeBaseline(overrides: Partial<BaselineSnapshot> = {}): BaselineSnapshot {
  return {
    timestamp: '2026-03-15T10:00:00.000Z',
    work_dir: '/tmp/test',
    test_file_count: 10,
    lint_error_count: 2,
    type_error_count: 0,
    loc: 3000,
    file_count: 50,
    primary_language: 'TypeScript',
    language_breakdown: { TypeScript: 40, JavaScript: 10 },
    ...overrides,
  };
}

describe('generateHtmlReport', () => {
  it('generates valid HTML with empty events', () => {
    const html = generateHtmlReport([]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('SkillFoundry Quality Report');
    expect(html).toContain('No telemetry data available');
    expect(html).toContain('</html>');
  });

  it('generates summary stats for forge runs', () => {
    const events = [
      makeEvent({ status: 'pass', duration_ms: 3000 }),
      makeEvent({ status: 'pass', duration_ms: 7000 }),
      makeEvent({ status: 'fail', duration_ms: 2000 }),
    ];

    const html = generateHtmlReport(events);

    expect(html).toContain('Total Runs');
    expect(html).toContain('3');
    expect(html).toContain('Pass Rate');
    expect(html).toContain('66.7%');
    expect(html).toContain('Avg Duration');
  });

  it('generates gate breakdown table', () => {
    const events = [
      makeEvent(),
      makeEvent({
        event_type: 'gate_execution',
        status: 'pass',
        details: { tier: 'T0', gate_name: 'Banned Patterns' },
      }),
      makeEvent({
        event_type: 'gate_execution',
        status: 'fail',
        details: { tier: 'T4', gate_name: 'Security' },
      }),
      makeEvent({
        event_type: 'gate_execution',
        status: 'pass',
        details: { tier: 'T4', gate_name: 'Security' },
      }),
    ];

    const html = generateHtmlReport(events);

    expect(html).toContain('Gate Breakdown');
    expect(html).toContain('T0');
    expect(html).toContain('T4');
    expect(html).toContain('Gate Tier');
  });

  it('generates trend chart when multiple days of data exist', () => {
    const events = [
      makeEvent({ timestamp: '2026-03-14T10:00:00.000Z', status: 'pass' }),
      makeEvent({ timestamp: '2026-03-15T10:00:00.000Z', status: 'fail' }),
    ];

    const html = generateHtmlReport(events);

    expect(html).toContain('Pass/Fail Trend');
    expect(html).toContain('trendChart');
    expect(html).toContain('Chart');
    expect(html).toContain('2026-03-14');
    expect(html).toContain('2026-03-15');
  });

  it('does not render trend chart for single day data', () => {
    const events = [
      makeEvent({ timestamp: '2026-03-15T10:00:00.000Z' }),
      makeEvent({ timestamp: '2026-03-15T11:00:00.000Z' }),
    ];

    const html = generateHtmlReport(events);

    // Single day produces only one trend entry, so no chart
    expect(html).not.toContain('trendChart');
  });

  it('renders baseline comparison when provided', () => {
    const events = [makeEvent()];
    const baseline = makeBaseline();

    const html = generateHtmlReport(events, baseline);

    expect(html).toContain('Code Quality Baseline');
    expect(html).toContain('Source Files');
    expect(html).toContain('50');
    expect(html).toContain('Lines of Code');
    expect(html).toContain('Test Files');
    expect(html).toContain('10');
    expect(html).toContain('TypeScript');
    expect(html).toContain('40');
    expect(html).toContain('JavaScript');
  });

  it('does not render baseline section when no baseline provided', () => {
    const events = [makeEvent()];
    const html = generateHtmlReport(events);

    expect(html).not.toContain('Code Quality Baseline');
    expect(html).not.toContain('Source Files');
  });

  it('shows N/A for unavailable tools in baseline', () => {
    const events = [makeEvent()];
    const baseline = makeBaseline({ lint_error_count: -1, type_error_count: -1 });

    const html = generateHtmlReport(events, baseline);

    expect(html).toContain('N/A');
  });

  // XSS prevention tests
  it('prevents XSS via event data injection', () => {
    const maliciousEvent = makeEvent({
      details: { gate_name: '<script>alert(1)</script>' },
    });
    // Use gate_execution to get the details rendered in the gate table
    const gateEvent = makeEvent({
      event_type: 'gate_execution',
      status: 'fail',
      details: { tier: '<script>alert(1)</script>', gate_name: 'xss' },
    });

    const html = generateHtmlReport([maliciousEvent, gateEvent]);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('prevents XSS via baseline data injection', () => {
    const events = [makeEvent()];
    const baseline = makeBaseline({
      primary_language: '<img src=x onerror=alert(1)>',
      language_breakdown: { '<script>alert(1)</script>': 5 },
    });

    const html = generateHtmlReport(events, baseline);

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes HTML entities in all string values', () => {
    const events = [makeEvent()];
    const baseline = makeBaseline({
      primary_language: 'Type"Script & <More>',
    });

    const html = generateHtmlReport(events, baseline);

    expect(html).toContain('Type&quot;Script &amp; &lt;More&gt;');
    expect(html).not.toContain('Type"Script & <More>');
  });

  it('includes Chart.js CDN script tag', () => {
    const html = generateHtmlReport([]);

    expect(html).toContain('https://cdn.jsdelivr.net/npm/chart.js');
  });

  it('includes generation timestamp in footer', () => {
    const html = generateHtmlReport([]);

    expect(html).toContain('Generated by SkillFoundry Quality Intelligence');
  });

  it('uses dark theme colors', () => {
    const html = generateHtmlReport([]);

    expect(html).toContain('background: #0d1117');
    expect(html).toContain('color: #c9d1d9');
  });

  it('includes data range in footer when events exist', () => {
    const events = [
      makeEvent({ timestamp: '2026-03-10T10:00:00.000Z' }),
      makeEvent({ timestamp: '2026-03-15T10:00:00.000Z' }),
    ];

    const html = generateHtmlReport(events);

    expect(html).toContain('Data range:');
    expect(html).toContain('2026-03-10');
    expect(html).toContain('2026-03-15');
  });

  it('handles large number of events without error', () => {
    const events: TelemetryEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(makeEvent({
        timestamp: `2026-03-${String(Math.floor(i / 10) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
        status: i % 3 === 0 ? 'fail' : 'pass',
      }));
    }

    const html = generateHtmlReport(events);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('100');
    expect(html).toContain('</html>');
  });
});
