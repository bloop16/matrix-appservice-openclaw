import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenclawClient } from '../../src/openclaw/client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OpenclawClient.listAgents', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns model ids from /v1/models', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openclaw/default', object: 'model' },
          { id: 'openclaw/coding', object: 'model' },
        ],
      }),
    });

    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    const agents = await client.listAgents();
    expect(agents).toEqual([
      { id: 'openclaw/default', displayName: 'default' },
      { id: 'openclaw/coding', displayName: 'coding' },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:18789/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'bad' });
    await expect(client.listAgents()).rejects.toThrow('401');
  });
});
