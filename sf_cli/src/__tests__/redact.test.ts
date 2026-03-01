import { describe, it, expect } from 'vitest';
import { redactText } from '../core/redact.js';

describe('Redaction', () => {
  it('redacts OpenAI keys', () => {
    const input = 'key is sk-abcdefghijklmnopqrstuvwxyz123456';
    const result = redactText(input, true);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
  });

  it('redacts xAI keys', () => {
    const input = 'key: xai-abcdefghijklmnopqrstuvwxyz123456';
    expect(redactText(input, true)).toContain('[REDACTED]');
  });

  it('redacts Anthropic keys', () => {
    const input = 'key: sk-ant-abcdefghijklmnopqrstuvwxyz12';
    expect(redactText(input, true)).toContain('[REDACTED]');
  });

  it('redacts GitHub tokens', () => {
    const input = 'token: ghp_abcdefghijklmnopqrstuv';
    expect(redactText(input, true)).toContain('[REDACTED]');
  });

  it('redacts AWS access keys', () => {
    const input = 'key: AKIAIOSFODNN7EXAMPLE';
    expect(redactText(input, true)).toContain('[REDACTED]');
  });

  it('passes through when disabled', () => {
    const input = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    expect(redactText(input, false)).toBe(input);
  });

  it('passes through normal text', () => {
    const input = 'This is just a normal message with no secrets.';
    expect(redactText(input, true)).toBe(input);
  });

  it('handles multiple keys in one string', () => {
    const input = 'Keys: sk-abc12345678901234567890 and xai-xyz12345678901234567890';
    const result = redactText(input, true);
    expect(result).toBe('Keys: [REDACTED] and [REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const result = redactText(input, true);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('eyJhbGci');
  });

  it('redacts JWT tokens', () => {
    const input = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV';
    const result = redactText(input, true);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts MongoDB connection URIs', () => {
    const input = 'DB_URL=mongodb+srv://user:password@cluster0.example.net/mydb';
    const result = redactText(input, true);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('password@cluster0');
  });

  it('redacts PostgreSQL connection URIs', () => {
    const input = 'DATABASE_URL=postgresql://admin:secret@localhost:5432/mydb';
    const result = redactText(input, true);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('secret@localhost');
  });
});
