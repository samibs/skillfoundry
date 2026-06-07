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
});
