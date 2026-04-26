export interface AgentInfo {
  id: string;
  displayName: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClientConfig {
  url: string;
  token: string;
}

export class OpenclawClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: ClientConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    };
  }

  async listAgents(): Promise<AgentInfo[]> {
    const res = await fetch(`${this.baseUrl}/v1/models`, { headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Openclaw /v1/models returned ${res.status}: ${text}`);
    }
    const body = (await res.json()) as { data: { id: string }[] };
    return body.data.map((m) => ({
      id: m.id,
      displayName: m.id.replace(/^openclaw\//, ''),
    }));
  }

  async streamChat(
    agentId: string,
    messages: ChatMessage[],
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ model: agentId, messages, stream: true }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Openclaw chat returned ${res.status}: ${text}`);
    }
    if (!res.body) throw new Error('No response body from Openclaw');
    return res.body;
  }
}
