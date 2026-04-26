import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { writeFileSync, unlinkSync } from 'fs';

describe('loadConfig', () => {
  it('loads and validates a valid config', () => {
    const yaml = `
homeserver:
  url: "https://matrix.example.com"
  domain: "example.com"
openclaw:
  url: "http://127.0.0.1:18789"
  token: "test-token"
database:
  url: "postgresql://localhost/test"
appservice:
  port: 9993
`;
    writeFileSync('/tmp/test-config.yaml', yaml);
    const cfg = loadConfig('/tmp/test-config.yaml');
    expect(cfg.homeserver.domain).toBe('example.com');
    expect(cfg.openclaw.token).toBe('test-token');
    expect(cfg.openclaw.maxHistoryMessages).toBe(50); // default
    expect(cfg.appservice.port).toBe(9993);
    unlinkSync('/tmp/test-config.yaml');
  });

  it('throws on missing required field', () => {
    const yaml = `homeserver:\n  url: "https://example.com"\n`;
    writeFileSync('/tmp/bad-config.yaml', yaml);
    expect(() => loadConfig('/tmp/bad-config.yaml')).toThrow();
    unlinkSync('/tmp/bad-config.yaml');
  });
});
