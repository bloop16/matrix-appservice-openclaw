import { describe, it, expect } from 'vitest';
import { parseCommand, isRateLimited } from '../../src/handlers/control.js';

describe('parseCommand', () => {
  it('parses !openclaw agents', () => {
    expect(parseCommand('!openclaw agents')).toEqual({ type: 'agents' });
  });

  it('parses !openclaw new coding', () => {
    expect(parseCommand('!openclaw new coding')).toEqual({ type: 'new', name: 'coding' });
  });

  it('parses !openclaw new code-review', () => {
    expect(parseCommand('!openclaw new code-review')).toEqual({ type: 'new', name: 'code-review' });
  });

  it('parses !openclaw sessions', () => {
    expect(parseCommand('!openclaw sessions')).toEqual({ type: 'sessions' });
  });

  it('parses !openclaw help', () => {
    expect(parseCommand('!openclaw help')).toEqual({ type: 'help' });
  });

  it('returns null for non-openclaw messages', () => {
    expect(parseCommand('hello world')).toBeNull();
  });

  it('returns null for unknown subcommand', () => {
    expect(parseCommand('!openclaw unknown')).toBeNull();
  });
});

describe('isRateLimited', () => {
  it('allows up to 10 commands per minute', () => {
    const state = new Map<string, number[]>();
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited('@user:example.com', state)).toBe(false);
    }
    expect(isRateLimited('@user:example.com', state)).toBe(true);
  });
});
