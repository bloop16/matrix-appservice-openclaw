export interface StreamResult {
  text: string;
  interrupted: boolean;
  sessionId?: string;
}

export async function collectStream(body: ReadableStream<Uint8Array>): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let done = false;
  let sessionId: string | undefined;

  try {
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') { done = true; break; }
        try {
          const parsed = JSON.parse(payload) as {
            id?: string;
            choices: { delta: { content?: string } }[];
          };
          if (!sessionId && parsed.id) sessionId = parsed.id;
          accumulated += parsed.choices[0]?.delta?.content ?? '';
        } catch {
          // skip malformed SSE lines
        }
      }
      if (done) break;
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') done = true;
        else {
          try {
            const parsed = JSON.parse(payload) as {
              id?: string;
              choices: { delta: { content?: string } }[];
            };
            if (!sessionId && parsed.id) sessionId = parsed.id;
            accumulated += parsed.choices[0]?.delta?.content ?? '';
          } catch {
            // skip malformed
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: accumulated, interrupted: !done, sessionId };
}
