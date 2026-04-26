import { describe, it, expect } from 'vitest';
import { collectStream } from '../../src/openclaw/stream.js';

function makeStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });
}

function makeStreamRaw(raw: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(raw));
      controller.close();
    },
  });
}

describe('collectStream', () => {
  it('collects chunks into a full response', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
    ]);
    const result = await collectStream(stream);
    expect(result.text).toBe('Hello world');
    expect(result.interrupted).toBe(false);
  });

  it('marks as interrupted when stream ends without [DONE]', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"Partial"}}]}',
    ]);
    const result = await collectStream(stream);
    expect(result.text).toBe('Partial');
    expect(result.interrupted).toBe(true);
  });

  it('handles empty delta chunks (role-only frames)', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"role":"assistant"}}]}',
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      'data: [DONE]',
    ]);
    const result = await collectStream(stream);
    expect(result.text).toBe('Hi');
  });

  it('detects [DONE] in final buffer when no trailing newline', async () => {
    const raw =
      'data: {"choices":[{"delta":{"content":"hello"}}]}\ndata: [DONE]';
    const stream = makeStreamRaw(raw);
    const result = await collectStream(stream);
    expect(result.text).toBe('hello');
    expect(result.interrupted).toBe(false);
  });

  it('extracts content from final buffer when no trailing newline and no [DONE]', async () => {
    const raw = 'data: {"choices":[{"delta":{"content":"world"}}]}';
    const stream = makeStreamRaw(raw);
    const result = await collectStream(stream);
    expect(result.text).toBe('world');
    expect(result.interrupted).toBe(true);
  });
});
