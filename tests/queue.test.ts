import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomQueue } from '../src/queue.js';

afterEach(() => {
  vi.useRealTimers();
});

// Helper: flush N microtask ticks
async function flushMicrotasks(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

describe('RoomQueue', () => {
  it('processes tasks sequentially per room', async () => {
    vi.useFakeTimers();
    const queue = new RoomQueue();
    const order: number[] = [];

    let resolve1!: () => void;
    const p1 = new Promise<void>((r) => { resolve1 = r; });

    queue.enqueue('room1', () => p1.then(() => { order.push(1); }));
    queue.enqueue('room1', async () => { order.push(2); });
    queue.enqueue('room2', async () => { order.push(3); });

    // room2 and room1's first task start immediately
    await flushMicrotasks();
    expect(order).toContain(3); // room2 ran
    expect(order).not.toContain(1); // room1 task 1 not done yet (waiting on p1)
    expect(order).not.toContain(2); // room1 task 2 blocked behind task 1

    resolve1();
    await flushMicrotasks();
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
  });

  it('different rooms run independently', async () => {
    vi.useFakeTimers();
    const queue = new RoomQueue();
    const started: string[] = [];

    let resolveA!: () => void;
    const pA = new Promise<void>((r) => { resolveA = r; });

    queue.enqueue('roomA', () => { started.push('A'); return pA; });
    queue.enqueue('roomB', async () => { started.push('B'); });

    await flushMicrotasks();
    expect(started).toContain('A');
    expect(started).toContain('B');
    resolveA();
  });

  it('a task error does not break the queue chain', async () => {
    vi.useFakeTimers();
    const queue = new RoomQueue();
    const order: string[] = [];

    queue.enqueue('room1', async () => { throw new Error('boom'); });
    queue.enqueue('room1', async () => { order.push('second'); });

    await flushMicrotasks();
    expect(order).toContain('second');
  });
});
