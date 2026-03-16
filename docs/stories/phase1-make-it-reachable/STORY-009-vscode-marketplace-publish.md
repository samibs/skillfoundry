# STORY-009: VS Code Marketplace Publish + 1.0.0

**Phase:** D — VS Code Extension
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-007 (report.html must exist for "Open Last Report" command)
**Affects:** FR-015, FR-016, FR-017, US-007, US-008

---

## Description

Prepare the VS Code extension for Marketplace publication: bump version to 1.0.0, add the "Open Last Report" command, ensure all Marketplace requirements are met (icon, README, CHANGELOG, LICENSE), and publish to the VS Code Marketplace.

---

## Scope

### Files to create:
- `skillfoundry-vscode/CHANGELOG.md` — Extension changelog
- `skillfoundry-vscode/media/icon.png` — 128x128 extension icon (PNG)
- `skillfoundry-vscode/src/commands/openLastReport.ts` — "Open Last Report" command

### Files to modify:
- `skillfoundry-vscode/package.json` — version 0.1.0 -> 1.0.0, add icon, add new command, add publisher, add repository
- `skillfoundry-vscode/src/extension.ts` — register the new command
- `.github/workflows/release.yml` — add VS Code extension publish step (optional, can be manual initially)

---

## Technical Approach

### Version bump: 0.1.0 -> 1.0.0

Update `skillfoundry-vscode/package.json`:

```json
{
  "version": "1.0.0",
  "icon": "media/icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/samibs/skillfoundry"
  },
  "galleryBanner": {
    "color": "#1a1a2e",
    "theme": "dark"
  }
}
```

### "Open Last Report" command (`openLastReport.ts`):

```typescript
import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { join } from 'path';

export async function openLastReport(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }

  const reportPath = join(workspaceFolders[0].uri.fsPath, '.skillfoundry', 'report.html');

  if (!existsSync(reportPath)) {
    const action = await vscode.window.showWarningMessage(
      'No report found. Run "sf report --html" to generate one.',
      'Run Command'
    );
    if (action === 'Run Command') {
      const terminal = vscode.window.createTerminal('SkillFoundry');
      terminal.sendText('sf report --html');
      terminal.show();
    }
    return;
  }

  // Open in external browser
  const reportUri = vscode.Uri.file(reportPath);
  await vscode.env.openExternal(reportUri);
}
```

### Register in `extension.ts`:

```typescript
import { openLastReport } from './commands/openLastReport';

// In activate():
context.subscriptions.push(
  vscode.commands.registerCommand('skillfoundry.openLastReport', openLastReport)
);
```

### Add to `package.json` contributes.commands:

```json
{
  "command": "skillfoundry.openLastReport",
  "title": "SkillFoundry: Open Last Report"
}
```

### Marketplace requirements checklist:

| Requirement | Status | Location |
|------------|--------|----------|
| Publisher account (`skillfoundry`) | Must verify exists | VS Code Marketplace |
| `icon` field in package.json | Add 128x128 PNG | `media/icon.png` |
| `repository` field | Add GitHub URL | `package.json` |
| README.md | Already exists (verify) | `skillfoundry-vscode/README.md` |
| CHANGELOG.md | Create | `skillfoundry-vscode/CHANGELOG.md` |
| LICENSE | Inherited from root (MIT) | Verify `license` field |
| Categories | Already set | `package.json` |
| Activation events | Already set | `package.json` |

### Extension CHANGELOG.md:

```markdown
# Changelog

## 1.0.0 (2026-03-XX)

### Initial Marketplace Release

- Quality Dashboard sidebar with gate timeline, forge monitor, and dependencies
- Run gates from Command Palette, context menu, and CodeLens
- Inline diagnostics for gate findings
- Status bar indicator for project health
- "Open Last Report" command to view HTML quality reports
- Auto-refresh on telemetry changes
- Configurable gate timeout and metrics window
```

### Publishing process:

```bash
cd skillfoundry-vscode
npm install
npm run build
npm run lint      # tsc --noEmit
npm test          # vitest run (28 tests)
npx vsce package  # Creates skillfoundry-1.0.0.vsix
npx vsce publish  # Publishes to Marketplace (requires PAT)
```

The `vsce publish` command requires a Personal Access Token (PAT) from Azure DevOps with Marketplace Manage scope. This is a manual step for the first publish. Future publishes can be automated via CI.

### Key decisions:

1. **Manual first publish**: The first Marketplace publish is done manually to verify everything looks correct. CI automation is added after.
2. **No extension auto-update mechanism needed**: The Marketplace handles updates automatically when a new version is published.
3. **`openExternal` for report**: Opens the HTML file in the system's default browser, not in a VS Code webview. This is more reliable for Chart.js rendering.
4. **Fallback UX**: If no report exists, the command offers to run `sf report --html` in a terminal.

---

## Acceptance Criteria

```gherkin
Scenario: Extension found on Marketplace
  Given the extension is published
  When a developer searches "SkillFoundry" in VS Code Extensions panel
  Then the extension appears in results
  And it shows the correct icon, description, and version 1.0.0

Scenario: Extension installs from Marketplace
  Given a developer clicks "Install" on the Marketplace listing
  When the installation completes
  Then the SkillFoundry sidebar icon appears in the activity bar
  And the extension activates when a .skillfoundry/config.toml exists

Scenario: Open Last Report with existing report
  Given .skillfoundry/report.html exists in the workspace
  When the user runs "SkillFoundry: Open Last Report" from the command palette
  Then the report opens in the system default browser

Scenario: Open Last Report with no report
  Given .skillfoundry/report.html does not exist
  When the user runs "SkillFoundry: Open Last Report"
  Then a warning message appears: "No report found. Run 'sf report --html' to generate one."
  And a "Run Command" button is available
  When the user clicks "Run Command"
  Then a terminal opens and runs "sf report --html"

Scenario: All 28 existing tests still pass
  Given the extension has been modified
  When "npm test" is run
  Then all 28 existing tests pass
  And the new openLastReport command has tests

Scenario: VSIX package is valid
  Given the extension is built
  When "vsce package" is run
  Then a .vsix file is created without warnings
  And it includes the icon, README, CHANGELOG, and LICENSE
```

---

## Security Checklist

- [ ] No secrets or tokens in extension source code
- [ ] PAT for Marketplace publish is not committed to repo
- [ ] Extension requests minimal permissions (no network access, no file system beyond workspace)
- [ ] `openExternal` uses `vscode.Uri.file()` not a raw string (prevents path injection)
- [ ] Extension does not send data to external services

---

## Testing

### New tests for `openLastReport`:
- Test with existing report file (mock `vscode.env.openExternal`)
- Test with missing report file (mock warning message)
- Test with no workspace folder (mock warning message)
- Test "Run Command" button creates terminal

### Existing test suite:
- All 28 existing tests must continue to pass
- Run `npm test` before and after changes to confirm no regressions

### Manual testing:
- Package with `vsce package`, install the VSIX locally via `code --install-extension`
- Verify all sidebar views render
- Verify "Open Last Report" works
- Verify CodeLens and inline diagnostics still work
