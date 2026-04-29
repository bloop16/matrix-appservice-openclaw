import { Bridge, AppServiceRegistration, MembershipCache, type UserMembership } from 'matrix-appservice-bridge';
import type { AppServiceOutput } from 'matrix-appservice';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import type { Config } from './config.js';

// _ensureJoined() checks getMemberEntry() — null on a fresh start causes a
// re-join attempt via the bot-sdk's ensureRegisteredAndJoined(), which fails
// for existing users that Synapse considers already joined.
// Returning 'join' as default skips the re-join without preventing actual
// registration: isUserRegistered() is intentionally NOT overridden so that
// new virtual users get properly registered on first use.
class AlwaysJoinedCache extends MembershipCache {
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
    membershipCache: new AlwaysJoinedCache(),
    controller: {
      onEvent,
      onUserQuery: async () => ({}),
    },
  });
}
