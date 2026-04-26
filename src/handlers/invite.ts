import { localpartToAgentId } from '../openclaw/agents.js';
import type { SessionStore } from '../store/session.js';
import type { AgentSyncService } from '../openclaw/agents.js';

interface InviteContext {
  roomId: string;
  invitedMxid: string;
  senderMxid: string;
  domain: string;
  bridge: { getIntent: (mxid: string) => { join: (roomId: string) => Promise<void> } };
  store: Pick<SessionStore, 'getRoom' | 'createRoom'>;
  agentSync: Pick<AgentSyncService, 'isKnownAgent'>;
}

export async function handleInvite(ctx: InviteContext): Promise<void> {
  const localpart = ctx.invitedMxid.slice(1, ctx.invitedMxid.indexOf(':'));
  const agentId = localpartToAgentId(localpart);

  if (!ctx.agentSync.isKnownAgent(agentId)) return;

  const intent = ctx.bridge.getIntent(ctx.invitedMxid);
  await intent.join(ctx.roomId);

  const existing = await ctx.store.getRoom(ctx.roomId);
  if (!existing) {
    await ctx.store.createRoom({
      id: ctx.roomId,
      agentId,
      matrixUserId: ctx.senderMxid,
    });
  }
}
