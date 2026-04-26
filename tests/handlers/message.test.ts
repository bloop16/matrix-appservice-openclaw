import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../../src/handlers/message.js';

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    appendMessage: vi.fn().mockResolvedValue(true),
    getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: null }, sessionId: null }),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    updateRoomSessionId: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    sendNotice: vi.fn().mockResolvedValue(undefined),
    sendTyping: vi.fn().mockResolvedValue(undefined),
    sendText: vi.fn().mockResolvedValue(undefined),
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
  maxHistory: 50,
};

describe('handleMessage', () => {
  it('skips duplicate events (appendMessage returns false)', async () => {
    const store = makeStore({ appendMessage: vi.fn().mockResolvedValue(false) });
    const client = { streamChat: vi.fn() };

    await handleMessage({ ...BASE_CTX, store: store as any, client: client as any, bridge: {} as any });

    expect(store.getRecentMessages).not.toHaveBeenCalled();
    expect(client.streamChat).not.toHaveBeenCalled();
  });

  it('sends "agent unavailable" notice for deleted agent', async () => {
    const store = makeStore({ getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: new Date() }, sessionId: null }) });
    const intent = makeIntent();
    const client = { streamChat: vi.fn() };

    await handleMessage({ ...BASE_CTX, eventId: 'evt2', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendNotice).toHaveBeenCalledWith('!room:example.com', expect.stringContaining('no longer available'));
    expect(client.streamChat).not.toHaveBeenCalled();
  });

  it('streams response and sends notice on success', async () => {
    const store = makeStore({ getRecentMessages: vi.fn().mockResolvedValue([{ role: 'user', content: 'hello' }]) });
    const intent = makeIntent();
    const stream = makeStream([
      'data: {"id":"chatcmpl_abc","choices":[{"delta":{"content":"Hi"}}]}\n',
      'data: [DONE]\n',
    ]);
    const client = { streamChat: vi.fn().mockResolvedValue(stream) };

    await handleMessage({ ...BASE_CTX, eventId: 'evt3', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendTyping).toHaveBeenCalledWith('!room:example.com', true);
    expect(intent.sendTyping).toHaveBeenCalledWith('!room:example.com', false);
    expect(intent.sendNotice).toHaveBeenCalledWith('!room:example.com', 'Hi');
    expect(store.appendMessage).toHaveBeenLastCalledWith({ roomId: '!room:example.com', role: 'assistant', content: 'Hi', eventId: null });
  });

  it('saves sessionId returned by stream', async () => {
    const store = makeStore();
    const stream = makeStream([
      'data: {"id":"chatcmpl_session-x","choices":[{"delta":{"content":"Hi"}}]}\n',
      'data: [DONE]\n',
    ]);
    const client = { streamChat: vi.fn().mockResolvedValue(stream) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtS', store: store as any, client: client as any, bridge: makeBridge() as any });

    expect(store.updateRoomSessionId).toHaveBeenCalledWith('!room:example.com', 'chatcmpl_session-x');
  });

  it('passes existing sessionId to streamChat', async () => {
    const store = makeStore({ getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: null }, sessionId: 'chatcmpl_existing' }) });
    const stream = makeStream(['data: [DONE]\n']);
    const client = { streamChat: vi.fn().mockResolvedValue(stream) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtR', store: store as any, client: client as any, bridge: makeBridge() as any });

    expect(client.streamChat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(AbortSignal),
      'chatcmpl_existing',
    );
  });

  it('does not save sessionId when stream returns none', async () => {
    const store = makeStore();
    const stream = makeStream(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n', 'data: [DONE]\n']);
    const client = { streamChat: vi.fn().mockResolvedValue(stream) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtN', store: store as any, client: client as any, bridge: makeBridge() as any });

    expect(store.updateRoomSessionId).not.toHaveBeenCalled();
  });

  it('sends timeout message on AbortError', async () => {
    const store = makeStore();
    const intent = makeIntent();
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const client = { streamChat: vi.fn().mockRejectedValue(abortError) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtT', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendNotice).toHaveBeenCalledWith('!room:example.com', '_(request timed out)_');
  });

  it('sends unreachable message on generic error', async () => {
    const store = makeStore();
    const intent = makeIntent();
    const client = { streamChat: vi.fn().mockRejectedValue(new Error('Connection refused')) };

    await handleMessage({ ...BASE_CTX, eventId: 'evtE', store: store as any, client: client as any, bridge: makeBridge(intent) as any });

    expect(intent.sendNotice).toHaveBeenCalledWith('!room:example.com', 'Openclaw is not reachable right now.');
  });
});
