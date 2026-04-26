import { Bridge, AppServiceRegistration, MembershipCache } from 'matrix-appservice-bridge';
import type { AppServiceOutput } from 'matrix-appservice';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import type { Config } from './config.js';

// Bridge.getIntent() overrides intentOptions.registered with
// membershipCache.isUserRegistered(), which is always false on a fresh start.
// Appservice virtual users are provisioned by the homeserver on first use —
// no explicit /register call is needed or wanted.
class AlwaysRegisteredCache extends MembershipCache {
  override isUserRegistered(_userId: string): boolean {
    return true;
  }
}

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
    membershipCache: new AlwaysRegisteredCache(),
    controller: {
      onEvent,
      onUserQuery: async () => ({}),
    },
  });
}
