import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentIdToLocalpart, localpartToAgentId, agentIdToMxid, AgentSyncService } from '../../src/openclaw/agents.js';

describe('agentIdToLocalpart', () => {
  it('strips openclaw/ prefix and replaces with openclaw-', () => {
    expect(agentIdToLocalpart('openclaw/coding')).toBe('openclaw-coding');
    expect(agentIdToLocalpart('openclaw/default')).toBe('openclaw-default');
    expect(agentIdToLocalpart('openclaw/code-review')).toBe('openclaw-code-review');
  });
});

describe('localpartToAgentId', () => {
  it('restores openclaw/ prefix', () => {
    expect(localpartToAgentId('openclaw-coding')).toBe('openclaw/coding');
    expect(localpartToAgentId('openclaw-default')).toBe('openclaw/default');
    expect(localpartToAgentId('openclaw-code-review')).toBe('openclaw/code-review');
  });

  it('only strips the leading openclaw- prefix', () => {
    expect(localpartToAgentId('openclaw-openclaw-agent')).toBe('openclaw/openclaw-agent');
  });
});

describe('agentIdToMxid', () => {
  it('returns a full Matrix user ID from agentId and domain', () => {
    expect(agentIdToMxid('openclaw/coding', 'example.com')).toBe('@openclaw-coding:example.com');
    expect(agentIdToMxid('openclaw/default', 'homeserver')).toBe('@openclaw-default:homeserver');
  });
});

describe('AgentSyncService.sync', () => {
  it('upserts new agents and soft-deletes removed ones', async () => {
    const mockClient = { listAgents: vi.fn() };
    const mockStore = { upsertAgent: vi.fn(), softDeleteAgent: vi.fn(), getActiveAgents: vi.fn() };

    mockClient.listAgents.mockResolvedValue([
      { id: 'openclaw/coding', displayName: 'coding' },
    ]);
    mockStore.getActiveAgents.mockResolvedValue([
      { id: 'openclaw/old', matrixUserId: '@openclaw-old:example.com' },
    ]);

    const service = new AgentSyncService(mockClient as any, mockStore as any, 'example.com');
    await service.sync();

    expect(mockStore.upsertAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'openclaw/coding' }),
    );
    expect(mockStore.softDeleteAgent).toHaveBeenCalledWith('openclaw/old');
  });

  it('isKnownAgent returns true after sync', async () => {
    const mockClient = { listAgents: vi.fn().mockResolvedValue([{ id: 'openclaw/coding', displayName: 'coding' }]) };
    const mockStore = { upsertAgent: vi.fn(), softDeleteAgent: vi.fn(), getActiveAgents: vi.fn().mockResolvedValue([]) };
    const service = new AgentSyncService(mockClient as any, mockStore as any, 'example.com');
    await service.sync();
    expect(service.isKnownAgent('openclaw/coding')).toBe(true);
    expect(service.isKnownAgent('openclaw/unknown')).toBe(false);
  });
});
