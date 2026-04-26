import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { writeFileSync, unlinkSync } from 'fs';

describe('loadConfig', () => {
  it('loads and validates a valid config', () => {
    writeFileSync('/tmp/test-config.yaml', `
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
`);
    try {
      const cfg = loadConfig('/tmp/test-config.yaml');
      expect(cfg.homeserver.domain).toBe('example.com');
      expect(cfg.openclaw.token).toBe('test-token');
      expect(cfg.openclaw.agentSyncIntervalMinutes).toBe(10);
      expect(cfg.openclaw.streamTimeoutSeconds).toBe(60);
      expect(cfg.appservice.port).toBe(9993);
      expect(cfg.appservice.bindAddress).toBe('127.0.0.1');
      expect(cfg.appservice.controlRoomAlias).toBe('openclaw-control');
    } finally {
      unlinkSync('/tmp/test-config.yaml');
    }
  });

  it('throws on missing required field', () => {
    writeFileSync('/tmp/bad-config.yaml', `homeserver:\n  url: "https://example.com"\n`);
    try {
      expect(() => loadConfig('/tmp/bad-config.yaml')).toThrow(/Invalid config/);
    } finally {
      unlinkSync('/tmp/bad-config.yaml');
    }
  });

  it('throws on missing file', () => {
    expect(() => loadConfig('/tmp/nonexistent-config.yaml')).toThrow(/Failed to read config file/);
  });
});
