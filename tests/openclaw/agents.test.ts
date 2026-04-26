import { describe, it, expect } from 'vitest';
import { agentIdToLocalpart, localpartToAgentId } from '../../src/openclaw/agents.js';

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
