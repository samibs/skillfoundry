import type { SlashCommand, SessionContext } from '../types.js';
import { recall, captureLesson, captureDecision, captureError, getMemoryStats } from '../core/memory.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Recall, capture, or view memory bank stats',
  usage: '/memory [recall <query>|capture <type> <content>|stats]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0] || 'stats';

    if (sub === 'stats') {
      const stats = getMemoryStats(session.workDir);
      const lines = [
        '**Memory Bank**',
        '',
        `  Total entries: ${stats.totalEntries}`,
      ];

      if (Object.keys(stats.byType).length > 0) {
        lines.push('  By type:');
        for (const [type, count] of Object.entries(stats.byType)) {
          lines.push(`    ${type}: ${count}`);
        }
      }

      if (Object.keys(stats.byFile).length > 0) {
        lines.push('  By file:');
        for (const [file, count] of Object.entries(stats.byFile)) {
          lines.push(`    ${file}: ${count}`);
        }
      }

      if (stats.recentEntries.length > 0) {
        lines.push('');
        lines.push('  Recent:');
        for (const entry of stats.recentEntries) {
          lines.push(`    [${entry.type}] ${entry.content.slice(0, 60)}${entry.content.length > 60 ? '...' : ''}`);
        }
      }

      return lines.join('\n');
    }

    if (sub === 'recall') {
      const query = parts.slice(1).join(' ');
      if (!query) {
        return 'Usage: /memory recall <query>\nExample: /memory recall authentication patterns';
      }

      const result = recall(session.workDir, query);

      if (result.entries.length === 0) {
        return `No memories matching "${query}"`;
      }

      const lines = [`**Memory Recall** (${result.matchCount} matches for "${query}")`, ''];
      for (const entry of result.entries) {
        lines.push(`  [${entry.type}] ${entry.content.slice(0, 80)}${entry.content.length > 80 ? '...' : ''}`);
        if (entry.tags.length > 0) {
          lines.push(`    tags: ${entry.tags.join(', ')}`);
        }
      }

      return lines.join('\n');
    }

    if (sub === 'capture') {
      const type = parts[1];
      const content = parts.slice(2).join(' ');

      if (!type || !content) {
        return 'Usage: /memory capture <lesson|decision|error> <content>\nExample: /memory capture lesson "Always validate API input before processing"';
      }

      const cleanContent = content.replace(/^["']|["']$/g, '');
      const tags = cleanContent
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);

      let entry;
      switch (type) {
        case 'lesson':
          entry = captureLesson(session.workDir, cleanContent, tags, 'cli');
          break;
        case 'decision':
          entry = captureDecision(session.workDir, cleanContent, tags, 'cli');
          break;
        case 'error':
          entry = captureError(session.workDir, cleanContent, tags, 'cli');
          break;
        default:
          return `Unknown type: ${type}. Use: lesson, decision, error`;
      }

      return `Captured ${type}: ${entry.id}\n${cleanContent}`;
    }

    return 'Usage: /memory [stats|recall <query>|capture <type> <content>]';
  },
};

export const lessonsCommand: SlashCommand = {
  name: 'lessons',
  description: 'Quick shortcut to capture a lesson',
  usage: '/lessons <content>',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    if (!args.trim()) {
      return 'Usage: /lessons <what you learned>\nExample: /lessons Always run type checks before committing';
    }

    const content = args.trim().replace(/^["']|["']$/g, '');
    const tags = content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    const entry = captureLesson(session.workDir, content, tags, 'cli');
    return `Lesson captured: ${entry.id}`;
  },
};
