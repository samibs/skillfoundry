import type { TelemetryEvent } from './telemetry.js';
import type { BaselineSnapshot } from './baseline-collector.js';
/**
 * Generate a self-contained HTML report from telemetry events and optional baseline.
 * All CSS is inlined, Chart.js is loaded from CDN. All data values are HTML-escaped.
 *
 * @param events - Array of telemetry events to report on
 * @param baseline - Optional baseline snapshot for comparison section
 * @returns Complete HTML string
 */
export declare function generateHtmlReport(events: TelemetryEvent[], baseline?: BaselineSnapshot): string;
