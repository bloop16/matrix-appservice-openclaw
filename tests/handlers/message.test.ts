import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../../src/handlers/message.js';

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    appendMessage: vi.fn().mockResolvedValue(true),
    getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: null }, sessionId: null }),
    ...overrides,
  };
}

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendTyping: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeBridge(intent = makeIntent()) {
  return { getIntent: vi.fn().mockReturnValue(intent) };
}

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const chunk of chunks) ctrl.enqueue(encoder.encode(chunk));
      ctrl.close();
    },
  });
}

const BASE_CTX = {
  roomId: '!room:example.com',
  senderMxid: '@user:example.com',
  eventId: 'evt1',
  body: 'hello',
  agentMxid: '@openclaw-coding:example.com',
  domain: 'example.com',
  timeoutSeconds: 60,
};

describe('handleMessage', () => {
  it('skips duplicate events (appendMessage returns false)', async () => {
    const store = makeStore({ appendMessage: vi.fn().mockResolvedValue(false) });
    const client = { streamChat: vi.fn() };

    await handleMessage({ ...BASE_CTX, store: store as any, client: client as any, bridge: {} as any });

    expect(client.streamChat).not.toHaveBeenCalled();
  });

  it('sends "agent unavailable" notice for deleted agent', async () => {
    const store = makeStore({ getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: new Date() } }) });
    const intent = makeIntent();
    const client = { streamChat: vi.fn() };

    await handleMessage({ ...BASE_CTX, eventId: 'evt2', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendMessage).toHaveBeenCalledWith('!room:example.com', { msgtype: 'm.notice', body: expect.stringContaining('no longer available') });
    expect(client.streamChat).not.toHaveBeenCalled();
  });

  it('streams response and sends notice on success', async () => {
    const store = makeStore();
    const intent = makeIntent();
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
      'data: [DONE]\n',
    ]);
    const client = { streamChat: vi.fn().mockResolvedValue(stream) };

    await handleMessage({ ...BASE_CTX, eventId: 'evt3', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendTyping).toHaveBeenCalledWith('!room:example.com', true);
    expect(intent.sendTyping).toHaveBeenCalledWith('!room:example.com', false);
    expect(intent.sendMessage).toHaveBeenCalledWith('!room:example.com', { msgtype: 'm.notice', body: 'Hi' });
    expect(store.appendMessage).toHaveBeenLastCalledWith({ roomId: '!room:example.com', role: 'assistant', content: 'Hi', eventId: null });
  });

  it('sends timeout message on AbortError', async () => {
    const store = makeStore();
    const intent = makeIntent();
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const client = { streamChat: vi.fn().mockRejectedValue(abortError) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtT', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendMessage).toHaveBeenCalledWith('!room:example.com', { msgtype: 'm.notice', body: '_(request timed out)_' });
  });

  it('sends unreachable message on generic error', async () => {
    const store = makeStore();
    const intent = makeIntent();
    const client = { streamChat: vi.fn().mockRejectedValue(new Error('Connection refused')) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtE', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendMessage).toHaveBeenCalledWith('!room:example.com', { msgtype: 'm.notice', body: 'Openclaw is not reachable right now.' });
  });
});
