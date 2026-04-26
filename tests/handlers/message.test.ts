import { describe, it, expect, vi } from 'vitest';
import { handleMessage } from '../../src/handlers/message.js';

describe('handleMessage', () => {
  it('skips duplicate events (appendMessage returns false)', async () => {
    const mockStore = {
      appendMessage: vi.fn().mockResolvedValue(false), // duplicate
      getRecentMessages: vi.fn(),
      getRoom: vi.fn(),
    };
    const mockClient = { streamChat: vi.fn() };

    await handleMessage({
      roomId: '!room:example.com',
      senderMxid: '@user:example.com',
      eventId: 'evt1',
      body: 'hello',
      agentMxid: '@openclaw-coding:example.com',
      domain: 'example.com',
      store: mockStore as any,
      client: mockClient as any,
      bridge: {} as any,
      timeoutSeconds: 60,
      maxHistory: 50,
    });

    expect(mockStore.getRecentMessages).not.toHaveBeenCalled();
    expect(mockClient.streamChat).not.toHaveBeenCalled();
  });

  it('sends "agent unavailable" notice for deleted agent', async () => {
    const mockStore = {
      appendMessage: vi.fn().mockResolvedValue(true), // new message
      getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: new Date() } }),
      getRecentMessages: vi.fn(),
    };
    const mockSendText = vi.fn();
    const mockBridge = { getIntent: vi.fn().mockReturnValue({ sendText: mockSendText }) };
    const mockClient = { streamChat: vi.fn() };

    await handleMessage({
      roomId: '!room:example.com',
      senderMxid: '@user:example.com',
      eventId: 'evt2',
      body: 'hello',
      agentMxid: '@openclaw-coding:example.com',
      domain: 'example.com',
      store: mockStore as any,
      client: mockClient as any,
      bridge: mockBridge as any,
      timeoutSeconds: 60,
      maxHistory: 50,
    });

    expect(mockSendText).toHaveBeenCalledWith(
      '!room:example.com',
      expect.stringContaining('no longer available'),
    );
    expect(mockClient.streamChat).not.toHaveBeenCalled();
  });

  it('streams response and sends notice on success', async () => {
    const mockStore = {
      appendMessage: vi.fn().mockResolvedValue(true),
      getRoom: vi.fn().mockResolvedValue({ agent: { deletedAt: null } }),
      getRecentMessages: vi.fn().mockResolvedValue([
        { role: 'user', content: 'hello' },
      ]),
    };
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n'));
        ctrl.enqueue(encoder.encode('data: [DONE]\n'));
        ctrl.close();
      },
    });
    const mockSendNotice = vi.fn();
    const mockSendTyping = vi.fn().mockResolvedValue(undefined);
    const mockBridge = {
      getIntent: vi.fn().mockReturnValue({
        sendNotice: mockSendNotice,
        sendTyping: mockSendTyping,
        sendText: vi.fn(),
      }),
    };
    const mockClient = { streamChat: vi.fn().mockResolvedValue(mockStream) };

    await handleMessage({
      roomId: '!room:example.com',
      senderMxid: '@user:example.com',
      eventId: 'evt3',
      body: 'hello',
      agentMxid: '@openclaw-coding:example.com',
      domain: 'example.com',
      store: mockStore as any,
      client: mockClient as any,
      bridge: mockBridge as any,
      timeoutSeconds: 60,
      maxHistory: 50,
    });

    expect(mockSendTyping).toHaveBeenCalledWith('!room:example.com', true);
    expect(mockSendTyping).toHaveBeenCalledWith('!room:example.com', false);
    expect(mockSendNotice).toHaveBeenCalledWith('!room:example.com', 'Hi');
  });
});
