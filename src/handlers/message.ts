import { collectStream } from '../openclaw/stream.js';
import { localpartToAgentId } from '../openclaw/agents.js';
import type { SessionStore } from '../store/session.js';
import type { OpenclawClient } from '../openclaw/client.js';

interface Intent {
  sendNotice: (roomId: string, text: string) => Promise<void>;
  sendTyping: (roomId: string, typing: boolean) => Promise<void>;
  sendText: (roomId: string, text: string) => Promise<void>;
}

interface Bridge {
  getIntent: (mxid: string) => Intent;
}

interface MessageContext {
  roomId: string;
  senderMxid: string;
  eventId: string;
  body: string;
  agentMxid: string;
  domain: string;
  store: Pick<SessionStore, 'appendMessage' | 'getRoom' | 'getRecentMessages' | 'updateRoomSessionId'>;
  client: Pick<OpenclawClient, 'streamChat'>;
  bridge: Bridge;
  timeoutSeconds: number;
  maxHistory: number;
}

export async function handleMessage(ctx: MessageContext): Promise<void> {
  // Persist user message; returns false if eventId already exists (duplicate)
  const isNew = await ctx.store.appendMessage({
    roomId: ctx.roomId,
    role: 'user',
    content: ctx.body,
    eventId: ctx.eventId,
  });
  if (!isNew) return;

  const room = await ctx.store.getRoom(ctx.roomId);
  const intent = ctx.bridge.getIntent(ctx.agentMxid);

  if (room?.agent?.deletedAt) {
    await intent.sendNotice(ctx.roomId, 'This agent is no longer available.');
    return;
  }

  const history = await ctx.store.getRecentMessages(ctx.roomId, ctx.maxHistory);
  const messages = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const localpart = ctx.agentMxid.slice(1, ctx.agentMxid.indexOf(':'));
  const agentId = localpartToAgentId(localpart);
  const existingSessionId = room?.sessionId ?? undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutSeconds * 1000);

  let replyText = '';
  let newSessionId: string | undefined;

  try {
    await intent.sendTyping(ctx.roomId, true);
    const stream = await ctx.client.streamChat(agentId, messages, controller.signal, existingSessionId);
    const result = await collectStream(stream);
    newSessionId = result.sessionId;
    replyText = result.interrupted
      ? `${result.text} _(response was cut short)_`
      : result.text;
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    replyText = isAbort
      ? '_(request timed out)_'
      : 'Openclaw is not reachable right now.';
  } finally {
    clearTimeout(timeout);
    await intent.sendTyping(ctx.roomId, false);
  }

  await intent.sendNotice(ctx.roomId, replyText);
  await ctx.store.appendMessage({
    roomId: ctx.roomId,
    role: 'assistant',
    content: replyText,
    eventId: null,
  });
  if (newSessionId) {
    await ctx.store.updateRoomSessionId(ctx.roomId, newSessionId);
  }
}
