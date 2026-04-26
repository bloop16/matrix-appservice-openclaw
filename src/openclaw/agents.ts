export function agentIdToLocalpart(agentId: string): string {
  return agentId.replace(/^openclaw\//, 'openclaw-');
}

export function localpartToAgentId(localpart: string): string {
  return localpart.replace(/^openclaw-/, 'openclaw/');
}

export function agentIdToMxid(agentId: string, domain: string): string {
  return `@${agentIdToLocalpart(agentId)}:${domain}`;
}
