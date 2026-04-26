import { Bridge, AppServiceRegistration } from 'matrix-appservice-bridge';
import type { AppServiceOutput } from 'matrix-appservice';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import type { Config } from './config.js';

export function createBridge(
  config: Config,
  regPath: string,
  onEvent: (req: { getData: () => Record<string, unknown> | undefined }, ctx: unknown) => Promise<void>,
): Bridge {
  const regData = load(readFileSync(regPath, 'utf8')) as AppServiceOutput;
  const registration = AppServiceRegistration.fromObject(regData);

  return new Bridge({
    homeserverUrl: config.homeserver.url,
    domain: config.homeserver.domain,
    registration,
    controller: {
      onEvent,
      onUserQuery: async () => ({}),
    },
  });
}
