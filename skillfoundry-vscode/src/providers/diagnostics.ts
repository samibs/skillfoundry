// Diagnostics Manager — Maps gate findings to VS Code DiagnosticCollection.
// T1 (banned patterns) → Warning diagnostics
// T4 (security scan) → Error diagnostics

import * as vscode from 'vscode';
import * as path from 'path';
import { GateResult } from '../bridge';

export class DiagnosticsManager {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('skillfoundry');
  }

  /**
   * Parse gate results and populate diagnostics.
   * Gate detail format: "file:line: message" or "path/to/file.ts:42: some finding"
   */
  updateFromGateResults(results: GateResult[]): void {
    this.collection.clear();

    const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

    for (const gate of results) {
      if (gate.status === 'pass' || gate.status === 'skip') continue;

      const severity = gate.tier === 'T4' ? vscode.DiagnosticSeverity.Error :
                       gate.status === 'fail' ? vscode.DiagnosticSeverity.Error :
                       vscode.DiagnosticSeverity.Warning;

      const findings = this.parseFindings(gate.detail, gate.tier, severity);

      for (const { uri, diagnostic } of findings) {
        const key = uri.toString();
        if (!diagnosticMap.has(key)) {
          diagnosticMap.set(key, []);
        }
        diagnosticMap.get(key)!.push(diagnostic);
      }
    }

    for (const [uriStr, diagnostics] of diagnosticMap) {
      this.collection.set(vscode.Uri.parse(uriStr), diagnostics);
    }
  }

  /**
   * Update diagnostics from a single gate run on a specific file.
   */
  updateForFile(fileUri: vscode.Uri, result: GateResult): void {
    if (result.status === 'pass') {
      this.collection.delete(fileUri);
      return;
    }

    const severity = result.tier === 'T4' ? vscode.DiagnosticSeverity.Error :
                     result.status === 'fail' ? vscode.DiagnosticSeverity.Error :
                     vscode.DiagnosticSeverity.Warning;

    const diagnostics: vscode.Diagnostic[] = [];
    const lines = result.detail.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      // Try to extract line number from the detail text
      const lineMatch = line.match(/(?:line\s+)?(\d+)/i);
      const lineNum = lineMatch ? Math.max(0, parseInt(lineMatch[1], 10) - 1) : 0;

      const range = new vscode.Range(lineNum, 0, lineNum, 200);
      const diag = new vscode.Diagnostic(range, line.trim(), severity);
      diag.source = `SkillFoundry ${result.tier}`;
      diagnostics.push(diag);
    }

    this.collection.set(fileUri, diagnostics);
  }

  private parseFindings(detail: string, tier: string, severity: vscode.DiagnosticSeverity): Array<{ uri: vscode.Uri; diagnostic: vscode.Diagnostic }> {
    const results: Array<{ uri: vscode.Uri; diagnostic: vscode.Diagnostic }> = [];
    const lines = detail.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      // Pattern: "path/to/file.ts:42: message" or "file.ts:42 message"
      const match = line.match(/^(.+?\.\w+):(\d+)[:\s]+(.+)/);
      if (match) {
        const [, filePath, lineStr, message] = match;
        // Validate file path stays within workspace boundary
        const resolved = path.resolve(filePath);
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (wsRoot && !resolved.startsWith(path.resolve(wsRoot))) continue;

        const lineNum = Math.max(0, parseInt(lineStr, 10) - 1);
        const uri = vscode.Uri.file(resolved);
        const range = new vscode.Range(lineNum, 0, lineNum, 200);
        const diag = new vscode.Diagnostic(range, message.trim(), severity);
        diag.source = `SkillFoundry ${tier}`;
        results.push({ uri, diagnostic: diag });
      }
    }

    return results;
  }

  clear(): void {
    this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }
}
