import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { SessionStore } from '../../src/store/session.js';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
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

  it('isDuplicateEvent returns true for known eventId', async () => {
    expect(await store.isDuplicateEvent('evt1')).toBe(true);
    expect(await store.isDuplicateEvent('unknown')).toBe(false);
  });

  it('gets and sets appstate', async () => {
    await store.setAppState('controlRoomId', '!ctrl:example.com');
    expect(await store.getAppState('controlRoomId')).toBe('!ctrl:example.com');
    expect(await store.getAppState('missing')).toBeNull();
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
});
