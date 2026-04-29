import type { OpenclawClient } from './client.js';
import type { SessionStore } from '../store/session.js';

export function agentIdToLocalpart(agentId: string): string {
  return agentId.replace(/^openclaw\//, 'openclaw-');
}

export function localpartToAgentId(localpart: string): string {
  return localpart.replace(/^openclaw-/, 'openclaw/');
}

export function agentIdToMxid(agentId: string, domain: string): string {
  return `@${agentIdToLocalpart(agentId)}:${domain}`;
}

export class AgentSyncService {
  private cachedAgentIds = new Set<string>();
  private lastSyncAt: Date | null = null;

  constructor(
    private readonly client: OpenclawClient,
    private readonly store: SessionStore,
    private readonly domain: string,
  ) {}

  async sync(): Promise<{ added: string[]; removed: string[] }> {
    const [remote, local] = await Promise.all([
      this.client.listAgents(),
      this.store.getActiveAgents(),
    ]);

    const remoteIds = new Set(remote.map((a) => a.id));
    const localIds = new Set(local.map((a) => a.id));
    const now = new Date();

    for (const agent of remote) {
      await this.store.upsertAgent({
        id: agent.id,
        matrixUserId: agentIdToMxid(agent.id, this.domain),
        displayName: agent.displayName,
        syncedAt: now,
      });
    }

    for (const localAgent of local) {
      if (!remoteIds.has(localAgent.id)) {
        await this.store.softDeleteAgent(localAgent.id);
      }
    }

    const added = [...remoteIds].filter((id) => !localIds.has(id));
    const removed = [...localIds].filter((id) => !remoteIds.has(id));

    this.cachedAgentIds = remoteIds;
    this.lastSyncAt = now;

    return { added, removed };
  }

  isKnownAgent(agentId: string): boolean {
    return this.cachedAgentIds.has(agentId);
  }

  getKnownAgentIds(): string[] {
    return [...this.cachedAgentIds];
  }

  getLastSyncAt(): Date | null {
    return this.lastSyncAt;
  }

  startPeriodicSync(intervalMinutes: number): ReturnType<typeof setInterval> {
    return setInterval(() => { void this.sync(); }, intervalMinutes * 60 * 1000);
  }
}
