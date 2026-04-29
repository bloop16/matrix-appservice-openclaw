import { describe, it, expect, vi } from 'vitest';
import { parseCommand, RateLimiter } from '../../src/handlers/control.js';

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

  it('parses !openclaw sync', () => {
    expect(parseCommand('!openclaw sync')).toEqual({ type: 'sync' });
  });

  it('parses !openclaw status', () => {
    expect(parseCommand('!openclaw status')).toEqual({ type: 'status' });
  });

  it('parses !openclaw close main', () => {
    expect(parseCommand('!openclaw close main')).toEqual({ type: 'close', name: 'main' });
  });

  it('parses !openclaw close with multi-word name', () => {
    expect(parseCommand('!openclaw close my session')).toEqual({ type: 'close', name: 'my session' });
  });

  it('returns null for !openclaw close without name', () => {
    expect(parseCommand('!openclaw close')).toBeNull();
  });

  it('returns null for unknown subcommand', () => {
    expect(parseCommand('!openclaw unknown')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('allows up to 10 commands per minute', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(limiter.isLimited('@user:example.com')).toBe(false);
    }
    expect(limiter.isLimited('@user:example.com')).toBe(true);
  });

  it('resets after the time window expires', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter();
    for (let i = 0; i < 10; i++) limiter.isLimited('@user:example.com');
    expect(limiter.isLimited('@user:example.com')).toBe(true);
    vi.advanceTimersByTime(61_000); // past 60s window
    expect(limiter.isLimited('@user:example.com')).toBe(false);
    vi.useRealTimers();
  });
});
