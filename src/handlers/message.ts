import { collectStream } from '../openclaw/stream.js';
import { localpartToAgentId } from '../openclaw/agents.js';
import type { SessionStore } from '../store/session.js';
import type { OpenclawClient } from '../openclaw/client.js';

interface Intent {
  sendMessage: (roomId: string, content: Record<string, unknown>) => Promise<unknown>;
  sendTyping: (roomId: string, typing: boolean) => Promise<void>;
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
  store: Pick<SessionStore, 'appendMessage' | 'getRoom'>;
  client: Pick<OpenclawClient, 'streamChat'>;
  bridge: Bridge;
  timeoutSeconds: number;
}

export async function handleMessage(ctx: MessageContext): Promise<void> {
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
    await intent.sendMessage(ctx.roomId, { msgtype: 'm.notice', body: 'This agent is no longer available.' });
    return;
  }

  const messages = [{ role: 'user' as const, content: ctx.body }];
  const localpart = ctx.agentMxid.slice(1, ctx.agentMxid.indexOf(':'));
  const agentId = localpartToAgentId(localpart);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutSeconds * 1000);

  let replyText = '';

  try {
    await intent.sendTyping(ctx.roomId, true);
    const stream = await ctx.client.streamChat(agentId, messages, controller.signal, ctx.roomId);
    const result = await collectStream(stream);
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

  await intent.sendMessage(ctx.roomId, { msgtype: 'm.notice', body: replyText });
  await ctx.store.appendMessage({
    roomId: ctx.roomId,
    role: 'assistant',
    content: replyText,
    eventId: null,
  });
}
