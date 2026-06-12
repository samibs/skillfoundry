import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Documentation Validation', () => {
  it('should have the Certified Skills Registry', () => {
    const filePath = join(process.cwd(), '../docs/SKILLS-CERTIFIED.md');
    expect(existsSync(filePath)).toBe(true);
  });

  it('should contain the Normalize Tags to Slugs certified skill', () => {
    const filePath = join(process.cwd(), '../docs/SKILLS-CERTIFIED.md');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('4ea22534-548d-49c8-8ced-cde11ca0ad4c');
    expect(content).toContain('Normalize Tags to Slugs');
    expect(content).toContain('1.0.0');
  });

  it('should be linked from API-REFERENCE.md', () => {
    const filePath = join(process.cwd(), '../docs/API-REFERENCE.md');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('[SKILLS-CERTIFIED.md](./SKILLS-CERTIFIED.md)');
  });

  // FR-DOCS-104 — Documentation & Knowledge Base Enhancement
  describe('FR-DOCS-104 deliverables', () => {
    const docsRoot = join(process.cwd(), '../docs');

    it('DEPLOYMENT-GUIDE.md exists and references real install scripts', () => {
      const filePath = join(docsRoot, 'DEPLOYMENT-GUIDE.md');
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('install-unified.sh');
      expect(content).toContain('update.sh');
      expect(content).toContain('scripts/dashboard.sh');
    });

    it('CONFIGURATION-REFERENCE.md exists and documents real config surfaces', () => {
      const filePath = join(docsRoot, 'CONFIGURATION-REFERENCE.md');
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('.claude/settings.json');
      expect(content).toContain('ANTHROPIC_API_KEY');
      expect(content).toContain('Never commit');
    });

    it('DOCS-VERSIONING-STRATEGY.md exists and declares WCAG baseline', () => {
      const filePath = join(docsRoot, 'DOCS-VERSIONING-STRATEGY.md');
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('WCAG 2.1');
      expect(content).toContain('Release-Triggered Review');
    });

    it('DOCUMENTATION-INDEX.md links all three new FR-DOCS-104 docs', () => {
      const filePath = join(docsRoot, 'DOCUMENTATION-INDEX.md');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('DEPLOYMENT-GUIDE.md');
      expect(content).toContain('CONFIGURATION-REFERENCE.md');
      expect(content).toContain('DOCS-VERSIONING-STRATEGY.md');
    });
  });
});
