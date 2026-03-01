/**
 * Audit Logger - Audit trail for compliance and security
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AuditLogger {
  constructor(logsDir = path.join(process.cwd(), 'logs')) {
    this.logsDir = logsDir;
  }

  /**
   * Log story completion
   */
  async logStoryCompletion(storyId, status, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'story_completion',
      story_id: storyId,
      status,
      ...details,
    };

    await this.writeAudit('story-completion', entry);
    return entry;
  }

  /**
   * Log security event
   */
  async logSecurityEvent(eventType, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'security_event',
      event_type: eventType,
      severity: details.severity || 'medium',
      ...details,
    };

    await this.writeAudit('security-events', entry);
    return entry;
  }

  /**
   * Log decision
   */
  async logDecision(agent, decision, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'decision',
      agent,
      decision,
      context,
    };

    await this.writeAudit('decisions', entry);
    return entry;
  }

  /**
   * Log file operation
   */
  async logFileOperation(operation, filePath, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'file_operation',
      operation, // create, update, delete, read
      file_path: filePath,
      ...details,
    };

    await this.writeAudit('file-operations', entry);
    return entry;
  }

  /**
   * Log agent action
   */
  async logAgentAction(agent, action, result, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'agent_action',
      agent,
      action,
      result: result.status || 'success',
      ...details,
    };

    await this.writeAudit('agent-actions', entry);
    return entry;
  }

  /**
   * Write audit entry to JSONL file
   */
  async writeAudit(category, entry) {
    const auditFile = path.join(this.logsDir, 'audit', `${category}.jsonl`);
    await fs.mkdir(path.dirname(auditFile), { recursive: true });
    await fs.appendFile(auditFile, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(category, limit = 100) {
    const auditFile = path.join(this.logsDir, 'audit', `${category}.jsonl`);
    try {
      const content = await fs.readFile(auditFile, 'utf-8');
      const entries = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
        .slice(-limit); // Get last N entries

      return entries.reverse(); // Most recent first
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Search audit trail
   */
  async searchAuditTrail(category, query) {
    const entries = await this.getAuditTrail(category, 1000);
    return entries.filter(entry => {
      const searchString = JSON.stringify(entry).toLowerCase();
      return searchString.includes(query.toLowerCase());
    });
  }
}
