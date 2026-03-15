// Forge Monitor — TreeDataProvider showing live forge pipeline progress.
// Watches .skillfoundry/forge-state.json for real-time updates.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ForgePhase {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  detail?: string;
}

interface ForgeState {
  runId: string;
  phases: ForgePhase[];
  storiesTotal: number;
  storiesCompleted: number;
  storiesFailed: number;
  currentStory?: string;
  startedAt: string;
}

export class ForgeMonitorProvider implements vscode.TreeDataProvider<ForgeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ForgeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private state: ForgeState | null = null;
  private watcher: vscode.FileSystemWatcher | null = null;

  constructor(private workDir: string) {}

  startWatching(): void {
    const stateFile = path.join(this.workDir, '.skillfoundry', 'forge-state.json');
    const pattern = new vscode.RelativePattern(this.workDir, '.skillfoundry/forge-state.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(() => this.refresh());
    this.watcher.onDidCreate(() => this.refresh());
    this.refresh();
  }

  stopWatching(): void {
    this.watcher?.dispose();
    this.watcher = null;
  }

  refresh(): void {
    this.state = this.readState();
    this._onDidChangeTreeData.fire(undefined);
  }

  private readState(): ForgeState | null {
    try {
      const stateFile = path.join(this.workDir, '.skillfoundry', 'forge-state.json');
      if (!fs.existsSync(stateFile)) return null;
      const content = fs.readFileSync(stateFile, 'utf-8');
      return JSON.parse(content) as ForgeState;
    } catch {
      return null;
    }
  }

  getTreeItem(element: ForgeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ForgeItem): ForgeItem[] {
    if (element) return [];

    if (!this.state) {
      return [new ForgeItem('No forge run active', 'info')];
    }

    const items: ForgeItem[] = [];

    // Phases
    for (const phase of this.state.phases) {
      const statusIcon = phase.status === 'passed' ? 'pass' :
                          phase.status === 'failed' ? 'error' :
                          phase.status === 'running' ? 'sync~spin' :
                          phase.status === 'skipped' ? 'circle-slash' :
                          'circle-outline';
      const item = new ForgeItem(phase.name, statusIcon);
      if (phase.durationMs) {
        item.description = `${(phase.durationMs / 1000).toFixed(1)}s`;
      } else if (phase.status === 'running') {
        item.description = 'running...';
      }
      items.push(item);
    }

    // Story progress
    if (this.state.storiesTotal > 0) {
      const storyItem = new ForgeItem(
        `Stories: ${this.state.storiesCompleted}/${this.state.storiesTotal}`,
        this.state.storiesFailed > 0 ? 'warning' : 'info',
      );
      if (this.state.currentStory) {
        storyItem.description = this.state.currentStory;
      }
      items.push(storyItem);
    }

    // Elapsed time
    const elapsed = Date.now() - new Date(this.state.startedAt).getTime();
    const elapsedItem = new ForgeItem(
      `Elapsed: ${(elapsed / 1000).toFixed(0)}s`,
      'info',
    );
    items.push(elapsedItem);

    return items;
  }

  dispose(): void {
    this.stopWatching();
  }
}

export class ForgeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly iconId: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
  }
}
