import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../core/intent.js';

describe('classifyIntent', () => {
  describe('chat intent (no tools needed)', () => {
    it('classifies greetings as chat', () => {
      expect(classifyIntent('ping')).toBe('chat');
      expect(classifyIntent('hello')).toBe('chat');
      expect(classifyIntent('hi!')).toBe('chat');
      expect(classifyIntent('thanks')).toBe('chat');
      expect(classifyIntent('ok')).toBe('chat');
    });

    it('classifies questions as chat', () => {
      expect(classifyIntent('what is TypeScript?')).toBe('chat');
      expect(classifyIntent('explain async await')).toBe('chat');
      expect(classifyIntent('how does React work?')).toBe('chat');
      expect(classifyIntent('tell me about REST APIs')).toBe('chat');
    });

    it('classifies short non-code messages as chat', () => {
      expect(classifyIntent('yes')).toBe('chat');
      expect(classifyIntent('sounds good')).toBe('chat');
      expect(classifyIntent('not sure')).toBe('chat');
    });
  });

  describe('agent intent (tools needed)', () => {
    it('classifies file operations as agent', () => {
      expect(classifyIntent('read the file src/app.ts')).toBe('agent');
      expect(classifyIntent('create a new component')).toBe('agent');
      expect(classifyIntent('edit the config file')).toBe('agent');
      expect(classifyIntent('fix the bug in auth.ts')).toBe('agent');
    });

    it('classifies build/run commands as agent', () => {
      expect(classifyIntent('run the tests')).toBe('agent');
      expect(classifyIntent('build the project')).toBe('agent');
      expect(classifyIntent('npm install express')).toBe('agent');
      expect(classifyIntent('git status')).toBe('agent');
    });

    it('classifies code search as agent', () => {
      expect(classifyIntent('search for the login function')).toBe('agent');
      expect(classifyIntent('find all .tsx files')).toBe('agent');
      expect(classifyIntent('where is the router defined?')).toBe('agent');
    });

    it('classifies file paths as agent', () => {
      expect(classifyIntent('look at src/index.ts')).toBe('agent');
      expect(classifyIntent('check package.json')).toBe('agent');
      expect(classifyIntent('update styles.css')).toBe('agent');
    });

    it('classifies implementation requests as agent', () => {
      expect(classifyIntent('implement user authentication')).toBe('agent');
      expect(classifyIntent('add dark mode to the dashboard')).toBe('agent');
      expect(classifyIntent('scaffold a new API endpoint for users')).toBe('agent');
      expect(classifyIntent('integrate the payment service')).toBe('agent');
    });

    it('classifies short tool commands as agent', () => {
      expect(classifyIntent('run tests')).toBe('agent');
      expect(classifyIntent('build it')).toBe('agent');
      expect(classifyIntent('lint please')).toBe('agent');
    });
  });
});
