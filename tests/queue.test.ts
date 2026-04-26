import { describe, it, expect, vi } from 'vitest';
import { RoomQueue } from '../src/queue.js';

describe('RoomQueue', () => {
  it('processes tasks sequentially per room', async () => {
    const queue = new RoomQueue();
    const order: number[] = [];

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    queue.enqueue('room1', async () => { await delay(20); order.push(1); });
    queue.enqueue('room1', async () => { order.push(2); });
    queue.enqueue('room2', async () => { order.push(3); });

    await delay(60);
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(2)); // room1: 1 before 2
    expect(order).toContain(3);
  });

  it('different rooms run independently (not serialised to each other)', async () => {
    const queue = new RoomQueue();
    const started: string[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    queue.enqueue('roomA', async () => { started.push('A'); await delay(30); });
    queue.enqueue('roomB', async () => { started.push('B'); });

    await delay(20);
    // both should have started before roomA finishes
    expect(started).toContain('A');
    expect(started).toContain('B');
  });

  it('a task error does not break the queue chain', async () => {
    const queue = new RoomQueue();
    const order: string[] = [];

    queue.enqueue('room1', async () => { throw new Error('boom'); });
    queue.enqueue('room1', async () => { order.push('second'); });

    await new Promise((r) => setTimeout(r, 30));
    expect(order).toContain('second');
  });
});
