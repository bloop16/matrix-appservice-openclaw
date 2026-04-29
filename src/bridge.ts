import { Bridge, AppServiceRegistration, MembershipCache, type UserMembership } from 'matrix-appservice-bridge';
import type { AppServiceOutput } from 'matrix-appservice';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import type { Config } from './config.js';

// Bridge.getIntent() overrides intentOptions.registered with
// membershipCache.isUserRegistered(), which is always false on a fresh start.
// _ensureJoined() also checks getMemberEntry() — null causes a re-join attempt
// via the bot-sdk which can fail for existing users.
// Appservice virtual users are provisioned and joined by the homeserver —
// returning true/join as defaults avoids unnecessary re-registration and
// re-join attempts after every service restart.
class AlwaysRegisteredCache extends MembershipCache {
  override isUserRegistered(_userId: string): boolean {
    return true;
  }

  override getMemberEntry(roomId: string, userId: string): UserMembership {
    return super.getMemberEntry(roomId, userId) ?? 'join';
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
