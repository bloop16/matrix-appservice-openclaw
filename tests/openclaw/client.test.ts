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

describe('OpenclawClient.streamChat', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('POSTs to /v1/chat/completions with correct payload and headers and returns a ReadableStream', async () => {
    const stream = new ReadableStream();
    mockFetch.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    const messages = [{ role: 'user' as const, content: 'Hello' }];
    const controller = new AbortController();
    const result = await client.streamChat('openclaw/default', messages, controller.signal);

    expect(result).toBe(stream);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:18789/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ model: 'openclaw/default', messages, stream: true }),
      }),
    );
  });

  it('throws with the status code in the message on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    const controller = new AbortController();
    await expect(
      client.streamChat('openclaw/default', [], controller.signal),
    ).rejects.toThrow('403');
  });

  it('forwards the AbortSignal to fetch', async () => {
    const stream = new ReadableStream();
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    const controller = new AbortController();
    await client.streamChat('openclaw/default', [], controller.signal);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('includes session_id in request body when provided', async () => {
    const stream = new ReadableStream();
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    await client.streamChat('openclaw/default', [], new AbortController().signal, 'chatcmpl_existing');

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse((call as any[])[1].body as string);
    expect(body['session_id']).toBe('chatcmpl_existing');
  });

  it('omits session_id when not provided', async () => {
    const stream = new ReadableStream();
    mockFetch.mockResolvedValue({ ok: true, body: stream });

    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    await client.streamChat('openclaw/default', [], new AbortController().signal);

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse((call as any[])[1].body as string);
    expect(body).not.toHaveProperty('session_id');
  });

  it('throws when response body is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: null,
      text: async () => '',
    }));
    const client = new OpenclawClient({ url: 'http://localhost:18789', token: 'tok' });
    await expect(
      client.streamChat('openclaw/coding', [], new AbortController().signal)
    ).rejects.toThrow('No response body');
  });
});
