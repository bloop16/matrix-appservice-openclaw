import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { SessionStore } from '../../src/store/session.js';

const DATABASE_URL = process.env['DATABASE_URL'];
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;
const prisma = pool ? new PrismaClient({ adapter: new PrismaPg(pool) }) : null;
let store: SessionStore;

beforeAll(async () => {
  store = new SessionStore(prisma);
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.appState.deleteMany();
});

afterAll(() => prisma.$disconnect());

describe('SessionStore', () => {
  it('upserts an agent', async () => {
    await store.upsertAgent({
      id: 'openclaw/test',
      matrixUserId: '@openclaw-test:example.com',
      displayName: 'test',
      syncedAt: new Date(),
    });
    const agent = await prisma.agent.findUnique({ where: { id: 'openclaw/test' } });
    expect(agent?.displayName).toBe('test');
  });

  it('creates a room', async () => {
    await store.createRoom({
      id: '!test:example.com',
      agentId: 'openclaw/test',
      matrixUserId: '@user:example.com',
      title: 'Test Room',
    });
    const room = await prisma.room.findUnique({ where: { id: '!test:example.com' } });
    expect(room?.matrixUserId).toBe('@user:example.com');
  });

  it('appends messages and retrieves last N', async () => {
    await store.appendMessage({ roomId: '!test:example.com', role: 'user', content: 'hi', eventId: 'evt1' });
    await store.appendMessage({ roomId: '!test:example.com', role: 'assistant', content: 'hello', eventId: null });
    const msgs = await store.getRecentMessages('!test:example.com', 50);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe('user');
  });

  it('appendMessage returns false for duplicate eventId', async () => {
    const result = await store.appendMessage({ roomId: '!test:example.com', role: 'user', content: 'dup', eventId: 'evt1' });
    expect(result).toBe(false);
  });

  it('gets and sets appstate', async () => {
    await store.setAppState('controlRoomId', '!ctrl:example.com');
    expect(await store.getAppState('controlRoomId')).toBe('!ctrl:example.com');
    expect(await store.getAppState('missing')).toBeNull();
  });

  it('deleteAppState removes the entry', async () => {
    await store.setAppState('staleKey', '!old:example.com');
    await store.deleteAppState('staleKey');
    expect(await store.getAppState('staleKey')).toBeNull();
  });

  it('deleteAppState is idempotent for missing keys', async () => {
    await expect(store.deleteAppState('nonexistent')).resolves.toBeUndefined();
  });

  it('getRoomsForAgent returns rooms for an agent', async () => {
    const rooms = await store.getRoomsForAgent('openclaw/test');
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    expect(rooms[0]?.agentId).toBe('openclaw/test');
  });

  it('getRoomsByUser returns rooms with agent', async () => {
    const rooms = await store.getRoomsByUser('@user:example.com');
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    expect(rooms[0]?.agent).toBeDefined();
    expect(rooms[0]?.agent.id).toBe('openclaw/test');
  });

  it('getRoom returns a room with agent', async () => {
    const room = await store.getRoom('!test:example.com');
    expect(room).not.toBeNull();
    expect(room?.agent).toBeDefined();
    expect(room?.matrixUserId).toBe('@user:example.com');
  });

  it('soft-deletes an agent', async () => {
    await store.softDeleteAgent('openclaw/test');
    const agent = await prisma.agent.findUnique({ where: { id: 'openclaw/test' } });
    expect(agent?.deletedAt).not.toBeNull();
  });

  it('getActiveAgents excludes soft-deleted', async () => {
    const active = await store.getActiveAgents();
    expect(active.find((a) => a.id === 'openclaw/test')).toBeUndefined();
  });

  it('upsertAgent resets deletedAt when agent returns', async () => {
    await store.softDeleteAgent('openclaw/test');
    let agent = await prisma.agent.findUnique({ where: { id: 'openclaw/test' } });
    expect(agent?.deletedAt).not.toBeNull();

    await store.upsertAgent({
      id: 'openclaw/test',
      matrixUserId: '@openclaw-test:example.com',
      displayName: 'test-updated',
      syncedAt: new Date(),
    });
    agent = await prisma.agent.findUnique({ where: { id: 'openclaw/test' } });
    expect(agent?.deletedAt).toBeNull();
  });
});
