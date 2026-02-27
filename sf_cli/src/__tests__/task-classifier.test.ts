import { describe, it, expect } from 'vitest';
import { classifyTask, selectProvider } from '../core/task-classifier.js';
import type { RoutingConfig } from '../core/task-classifier.js';

describe('classifyTask', () => {
  it('should classify documentation tasks as simple', () => {
    const result = classifyTask('Add a docstring to this function');
    expect(result.complexity).toBe('simple');
    expect(result.confidence).toBe('high');
    expect(result.matchedKeywords).toContain('docstring');
  });

  it('should classify formatting tasks as simple', () => {
    const result = classifyTask('Format this code and fix the lint errors');
    expect(result.complexity).toBe('simple');
    expect(result.matchedKeywords).toContain('format');
  });

  it('should classify explanation tasks as simple', () => {
    const result = classifyTask('Explain what this code does');
    expect(result.complexity).toBe('simple');
    expect(result.matchedKeywords).toContain('explain');
  });

  it('should classify architecture tasks as complex', () => {
    const result = classifyTask('Architect the payment service with microservices');
    expect(result.complexity).toBe('complex');
    expect(result.confidence).toBe('high');
    expect(result.matchedKeywords).toContain('architect');
  });

  it('should classify security tasks as complex', () => {
    const result = classifyTask('Run a security audit on this module');
    expect(result.complexity).toBe('complex');
    expect(result.matchedKeywords).toContain('security');
  });

  it('should classify refactoring as complex', () => {
    const result = classifyTask('Refactor the authentication module');
    expect(result.complexity).toBe('complex');
    expect(result.matchedKeywords).toContain('refactor');
  });

  it('should default to complex when both keywords match', () => {
    const result = classifyTask('Explain and refactor the security module');
    expect(result.complexity).toBe('complex');
    expect(result.confidence).toBe('medium');
  });

  it('should default to complex when no keywords match', () => {
    const result = classifyTask('do something');
    expect(result.complexity).toBe('complex');
    expect(result.confidence).toBe('low');
    expect(result.matchedKeywords).toEqual([]);
  });

  it('should classify readme task as simple', () => {
    const result = classifyTask('Update the README with installation instructions');
    expect(result.complexity).toBe('simple');
    expect(result.matchedKeywords).toContain('readme');
  });

  it('should classify test tasks as complex', () => {
    const result = classifyTask('Write unit tests for the user service');
    expect(result.complexity).toBe('complex');
    expect(result.matchedKeywords).toContain('test');
  });
});

describe('selectProvider', () => {
  const baseConfig: RoutingConfig = {
    routeLocalFirst: true,
    cloudProvider: 'anthropic',
    cloudModel: 'claude-sonnet-4-20250514',
    localProvider: 'ollama',
    localModel: 'llama3.1',
    localHealthy: true,
  };

  it('should route simple tasks to local when enabled and healthy', () => {
    const result = selectProvider('Add a docstring to this function', baseConfig);
    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('llama3.1');
    expect(result.savedLocally).toBe(true);
    expect(result.complexity).toBe('simple');
  });

  it('should route complex tasks to cloud', () => {
    const result = selectProvider('Refactor the entire auth module', baseConfig);
    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.savedLocally).toBe(false);
    expect(result.complexity).toBe('complex');
  });

  it('should route to cloud when local is unhealthy', () => {
    const config = { ...baseConfig, localHealthy: false };
    const result = selectProvider('Add a docstring to this function', config);
    expect(result.provider).toBe('anthropic');
    expect(result.savedLocally).toBe(false);
    expect(result.reason).toContain('offline');
  });

  it('should use cloud for everything when routing is disabled', () => {
    const config = { ...baseConfig, routeLocalFirst: false };
    const result = selectProvider('Add a docstring', config);
    expect(result.provider).toBe('anthropic');
    expect(result.savedLocally).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('should route unknown tasks to cloud', () => {
    const result = selectProvider('do something unusual', baseConfig);
    expect(result.provider).toBe('anthropic');
    expect(result.complexity).toBe('complex');
  });
});
