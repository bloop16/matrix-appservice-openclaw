import { describe, it, expect, vi } from 'vitest';
import { handleInvite } from '../../src/handlers/invite.js';

describe('handleInvite', () => {
  it('accepts invite for known agent and creates room', async () => {
    const mockJoin = vi.fn();
    const mockBridge = {
      getIntent: vi.fn().mockReturnValue({ join: mockJoin }),
    };
    const mockStore = {
      getRoom: vi.fn().mockResolvedValue(null),
      createRoom: vi.fn(),
    };
    const mockAgentSync = {
      isKnownAgent: vi.fn().mockReturnValue(true),
    };

    await handleInvite({
      roomId: '!room:example.com',
      invitedMxid: '@openclaw-coding:example.com',
      senderMxid: '@user:example.com',
      domain: 'example.com',
      bridge: mockBridge as any,
      store: mockStore as any,
      agentSync: mockAgentSync as any,
    });

    expect(mockJoin).toHaveBeenCalledWith('!room:example.com');
    expect(mockStore.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({ id: '!room:example.com', agentId: 'openclaw/coding' }),
    );
  });

  it('ignores invite for unknown agent', async () => {
    const mockBridge = { getIntent: vi.fn() };
    const mockStore = { getRoom: vi.fn(), createRoom: vi.fn() };
    const mockAgentSync = { isKnownAgent: vi.fn().mockReturnValue(false) };

    await handleInvite({
      roomId: '!room:example.com',
      invitedMxid: '@openclaw-unknown:example.com',
      senderMxid: '@user:example.com',
      domain: 'example.com',
      bridge: mockBridge as any,
      store: mockStore as any,
      agentSync: mockAgentSync as any,
    });

    expect(mockBridge.getIntent).not.toHaveBeenCalled();
  });

  it('does not create room if it already exists', async () => {
    const mockBridge = {
      getIntent: vi.fn().mockReturnValue({ join: vi.fn() }),
    };
    const mockStore = {
      getRoom: vi.fn().mockResolvedValue({ id: '!room:example.com' }),
      createRoom: vi.fn(),
    };
    const mockAgentSync = { isKnownAgent: vi.fn().mockReturnValue(true) };

    await handleInvite({
      roomId: '!room:example.com',
      invitedMxid: '@openclaw-coding:example.com',
      senderMxid: '@user:example.com',
      domain: 'example.com',
      bridge: mockBridge as any,
      store: mockStore as any,
      agentSync: mockAgentSync as any,
    });

    expect(mockStore.createRoom).not.toHaveBeenCalled();
  });
});
