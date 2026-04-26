type Command =
  | { type: 'agents' }
  | { type: 'new'; name: string }
  | { type: 'sessions' }
  | { type: 'help' };

export function parseCommand(text: string): Command | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!openclaw ')) return null;
  const args = trimmed.slice('!openclaw '.length).trim().split(/\s+/);
  const sub = args[0];

  if (sub === 'agents') return { type: 'agents' };
  if (sub === 'sessions') return { type: 'sessions' };
  if (sub === 'help') return { type: 'help' };
  if (sub === 'new' && args[1]) return { type: 'new', name: args[1] };
  return null;
}

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

export class RateLimiter {
  private readonly state = new Map<string, number[]>();

  isLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = (this.state.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (timestamps.length >= RATE_LIMIT) return true;
    this.state.set(userId, [...timestamps, now]);
    return false;
  }
}
