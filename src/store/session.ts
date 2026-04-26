import type { PrismaClient } from '@prisma/client';

export interface AppendMessageInput {
  roomId: string;
  role: string;
  content: string;
  eventId: string | null;
}

export class SessionStore {
  constructor(private readonly db: PrismaClient) {}

  async upsertAgent(data: {
    id: string;
    matrixUserId: string;
    displayName: string;
    syncedAt: Date;
  }): Promise<void> {
    await this.db.agent.upsert({
      where: { id: data.id },
      update: { displayName: data.displayName, syncedAt: data.syncedAt, deletedAt: null },
      create: data,
    });
  }

  async softDeleteAgent(id: string): Promise<void> {
    await this.db.agent.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getActiveAgents() {
    return this.db.agent.findMany({ where: { deletedAt: null } });
  }

  async getRoomsForAgent(agentId: string) {
    return this.db.room.findMany({ where: { agentId } });
  }

  async createRoom(data: {
    id: string;
    agentId: string;
    matrixUserId: string;
    title?: string;
  }): Promise<void> {
    await this.db.room.create({ data });
  }

  async getRoomsByUser(matrixUserId: string) {
    return this.db.room.findMany({ where: { matrixUserId }, include: { agent: true } });
  }

  async getRoom(id: string) {
    return this.db.room.findUnique({ where: { id }, include: { agent: true } });
  }

  async appendMessage(input: AppendMessageInput): Promise<void> {
    await this.db.message.create({
      data: {
        roomId: input.roomId,
        role: input.role,
        content: input.content,
        eventId: input.eventId,
      },
    });
  }

  async getRecentMessages(roomId: string, limit: number) {
    const msgs = await this.db.message.findMany({
      where: { roomId },
      orderBy: { timestamp: 'asc' },
      take: -limit,
    });
    return msgs;
  }

  async isDuplicateEvent(eventId: string): Promise<boolean> {
    const existing = await this.db.message.findUnique({ where: { eventId } });
    return existing !== null;
  }

  async getAppState(key: string): Promise<string | null> {
    const row = await this.db.appState.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async setAppState(key: string, value: string): Promise<void> {
    await this.db.appState.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
