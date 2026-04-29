import { type PrismaClient, Prisma, type Agent, type Room, type Message } from '@prisma/client';

export interface AppendMessageInput {
  roomId: string;
  role: 'user' | 'assistant';
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

  async getActiveAgents(): Promise<Agent[]> {
    return this.db.agent.findMany({ where: { deletedAt: null } });
  }

  async getRoomsForAgent(agentId: string): Promise<Room[]> {
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

  async deleteRoom(roomId: string): Promise<void> {
    await this.db.message.deleteMany({ where: { roomId } });
    await this.db.room.delete({ where: { id: roomId } });
  }

  async getRoomsByUser(matrixUserId: string): Promise<(Room & { agent: Agent })[]> {
    return this.db.room.findMany({ where: { matrixUserId }, include: { agent: true } });
  }

  async getRoom(id: string): Promise<(Room & { agent: Agent }) | null> {
    return this.db.room.findUnique({ where: { id }, include: { agent: true } });
  }

  async appendMessage(input: AppendMessageInput): Promise<boolean> {
    try {
      await this.db.message.create({
        data: {
          roomId: input.roomId,
          role: input.role,
          content: input.content,
          eventId: input.eventId,
        },
      });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        input.eventId !== null
      ) {
        return false;
      }
      throw err;
    }
  }

  async getRecentMessages(roomId: string, limit: number): Promise<Message[]> {
    const msgs = await this.db.message.findMany({
      where: { roomId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return msgs.reverse();
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

  async deleteAppState(key: string): Promise<void> {
    await this.db.appState.deleteMany({ where: { key } });
  }
}
