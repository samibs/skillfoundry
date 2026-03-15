// CodeLens Provider — Shows "Run Gate" actions above relevant code.
// - Test files (*.test.ts, *.spec.ts): "Run T3 (Tests)"
// - Source files: "Run T1 (Banned Patterns)" + "Run T4 (Security)"

import * as vscode from 'vscode';

const TEST_FILE_PATTERNS = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const SECURITY_PATTERNS = /\.(ts|tsx|js|jsx|py|cs|go|rs)$/;

export class SfCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('skillfoundry');
    if (!config.get<boolean>('showCodeLens', true)) return [];

    const fileName = document.fileName;
    const lenses: vscode.CodeLens[] = [];
    const topRange = new vscode.Range(0, 0, 0, 0);

    if (TEST_FILE_PATTERNS.test(fileName)) {
      // Test files get T3 (Tests) CodeLens
      lenses.push(new vscode.CodeLens(topRange, {
        title: '$(beaker) Run T3 (Tests)',
        command: 'skillfoundry.gate',
        arguments: ['T3'],
        tooltip: 'Run T3 quality gate — test execution and validation',
      }));
    }

    if (SECURITY_PATTERNS.test(fileName)) {
      // Source files get T1 (Banned Patterns) and T4 (Security)
      lenses.push(new vscode.CodeLens(topRange, {
        title: '$(search) Run T1 (Patterns)',
        command: 'skillfoundry.gateFile',
        arguments: [document.uri, 'T1'],
        tooltip: 'Run T1 quality gate — banned patterns and syntax check',
      }));

      if (!TEST_FILE_PATTERNS.test(fileName)) {
        lenses.push(new vscode.CodeLens(topRange, {
          title: '$(shield) Run T4 (Security)',
          command: 'skillfoundry.gateFile',
          arguments: [document.uri, 'T4'],
          tooltip: 'Run T4 quality gate — OWASP security scan + dependency CVEs',
        }));
      }
    }

    return lenses;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}
