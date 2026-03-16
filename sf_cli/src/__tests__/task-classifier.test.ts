import { describe, it, expect } from 'vitest';
import { classifyTask, selectProvider, checkOutputQuality, JurisdictionError } from '../core/task-classifier.js';
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

  it('should detect task type for security tasks', () => {
    const result = classifyTask('Run a security audit for vulnerabilities');
    expect(result.taskType).toBe('security');
  });

  it('should detect task type for documentation tasks', () => {
    const result = classifyTask('Document the API and explain the architecture');
    expect(result.taskType).toBe('documentation');
  });

  it('should detect task type for code generation', () => {
    const result = classifyTask('Implement a new module with a class and endpoints');
    expect(result.taskType).toBe('code_generation');
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

describe('selectProvider — jurisdiction guards', () => {
  const baseConfig: RoutingConfig = {
    routeLocalFirst: true,
    cloudProvider: 'anthropic',
    cloudModel: 'claude-sonnet-4-20250514',
    localProvider: 'ollama',
    localModel: 'llama3.1',
    localHealthy: true,
  };

  it('jurisdiction=strict routes ALL tasks locally', () => {
    const config: RoutingConfig = { ...baseConfig, dataJurisdiction: 'strict' };
    const result = selectProvider('Architect the payment service', config);
    expect(result.provider).toBe('ollama');
    expect(result.savedLocally).toBe(true);
    expect(result.reason).toContain('strict');
  });

  it('jurisdiction=strict with routing disabled still forces local', () => {
    const config: RoutingConfig = { ...baseConfig, routeLocalFirst: false, dataJurisdiction: 'strict' };
    const result = selectProvider('Architect the payment service', config);
    expect(result.provider).toBe('ollama');
    expect(result.savedLocally).toBe(true);
  });

  it('jurisdiction=eu blocks cloud for simple tasks', () => {
    const config: RoutingConfig = { ...baseConfig, dataJurisdiction: 'eu' };
    const result = selectProvider('Add a docstring to this function', config);
    expect(result.provider).toBe('ollama');
    expect(result.savedLocally).toBe(true);
    expect(result.reason).toContain('eu');
  });

  it('jurisdiction=eu allows cloud for complex tasks', () => {
    const config: RoutingConfig = { ...baseConfig, dataJurisdiction: 'eu' };
    const result = selectProvider('Architect the payment service', config);
    expect(result.provider).toBe('anthropic');
    expect(result.savedLocally).toBe(false);
    expect(result.reason).toContain('eu');
  });

  it('jurisdiction=eu throws when simple task and local is unhealthy', () => {
    const config: RoutingConfig = { ...baseConfig, dataJurisdiction: 'eu', localHealthy: false };
    expect(() => selectProvider('Add a docstring to this function', config)).toThrow(JurisdictionError);
  });

  it('jurisdiction=none has no effect', () => {
    const config: RoutingConfig = { ...baseConfig, dataJurisdiction: 'none' };
    const result = selectProvider('Architect the payment service', config);
    expect(result.provider).toBe('anthropic');
  });
});

describe('selectProvider — routing rules', () => {
  const baseConfig: RoutingConfig = {
    routeLocalFirst: true,
    cloudProvider: 'anthropic',
    cloudModel: 'claude-sonnet-4-20250514',
    localProvider: 'ollama',
    localModel: 'llama3.1',
    localHealthy: true,
  };

  it('rule security=cloud routes security tasks to cloud', () => {
    const config: RoutingConfig = {
      ...baseConfig,
      routingRules: { security: 'cloud' },
    };
    const result = selectProvider('Run a security audit for vulnerabilities', config);
    expect(result.provider).toBe('anthropic');
    expect(result.reason).toContain('security=cloud');
  });

  it('rule documentation=local routes doc tasks locally', () => {
    const config: RoutingConfig = {
      ...baseConfig,
      routingRules: { documentation: 'local' },
    };
    const result = selectProvider('Document the API and explain the flow', config);
    expect(result.provider).toBe('ollama');
    expect(result.reason).toContain('documentation=local');
  });

  it('rule=cloud blocked by jurisdiction=strict throws', () => {
    const config: RoutingConfig = {
      ...baseConfig,
      dataJurisdiction: 'strict',
      routingRules: { security: 'cloud' },
    };
    expect(() => selectProvider('Run a security audit for vulnerabilities', config)).toThrow(JurisdictionError);
  });

  it('rule=cloud with jurisdiction=eu allows cloud for explicit rules', () => {
    const config: RoutingConfig = {
      ...baseConfig,
      dataJurisdiction: 'eu',
      routingRules: { security: 'cloud' },
    };
    const result = selectProvider('Run a security audit for vulnerabilities', config);
    expect(result.provider).toBe('anthropic');
    expect(result.reason).toContain('eu');
  });

  it('rule=local falls back to cloud when local is unhealthy', () => {
    const config: RoutingConfig = {
      ...baseConfig,
      localHealthy: false,
      routingRules: { documentation: 'local' },
    };
    const result = selectProvider('Document the API and explain the flow', config);
    expect(result.provider).toBe('anthropic');
    expect(result.reason).toContain('offline');
  });

  it('rule=auto falls through to classifier', () => {
    const config: RoutingConfig = {
      ...baseConfig,
      routingRules: { security: 'auto' },
    };
    const result = selectProvider('Run a security audit', config);
    expect(result.provider).toBe('anthropic'); // complex task → cloud
    expect(result.reason).not.toContain('Rule');
  });
});

describe('checkOutputQuality', () => {
  it('should pass for normal response', () => {
    const result = checkOutputQuality('Explain the code', 'This function takes a list and returns the sum of all elements.');
    expect(result.passed).toBe(true);
  });

  it('should fail for empty response', () => {
    const result = checkOutputQuality('Explain the code', '');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Empty');
  });

  it('should fail for whitespace-only response', () => {
    const result = checkOutputQuality('Explain the code', '   \n  \t  ');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Empty');
  });

  it('should fail for refusal patterns', () => {
    const result = checkOutputQuality('Implement auth', "I'm sorry, I cannot help with that request.");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Refusal');
  });

  it('should fail for AI disclaimer refusals', () => {
    const result = checkOutputQuality('Write code', 'As an AI language model, I do not have the ability to write files.');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Refusal');
  });

  it('should fail for short code responses', () => {
    const result = checkOutputQuality('Implement the user class', 'ok');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Code task');
  });

  it('should pass for substantial code responses', () => {
    const code = 'class User {\n  constructor(name) {\n    this.name = name;\n  }\n  greet() { return `Hello ${this.name}`; }\n}';
    const result = checkOutputQuality('Implement the user class', code);
    expect(result.passed).toBe(true);
  });

  it('should fail for mostly non-alphanumeric content', () => {
    const garbage = '!@#$%^&*()_+{}|:"<>?'.repeat(5);
    const result = checkOutputQuality('Summarize the document', garbage);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('alphanumeric');
  });

  it('should not flag long legitimate refusal-like text', () => {
    // Refusal check only looks at first 200 chars — legitimate code after preamble should pass
    const response = 'Here is the implementation:\n' + 'x'.repeat(200) + "\nI can't believe how elegant this is.";
    const result = checkOutputQuality('Explain something', response);
    expect(result.passed).toBe(true);
  });
});
