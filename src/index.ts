import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Intent } from 'matrix-appservice-bridge';
import { loadConfig } from './config.js';
import { createBridge } from './bridge.js';
import { SessionStore } from './store/session.js';
import { OpenclawClient } from './openclaw/client.js';
import { AgentSyncService, agentIdToMxid } from './openclaw/agents.js';
import { RoomQueue } from './queue.js';
import { handleInvite } from './handlers/invite.js';
import { handleMessage } from './handlers/message.js';
import { parseCommand, RateLimiter } from './handlers/control.js';

const CONFIG_PATH = process.env['CONFIG_PATH'] ?? 'config.yaml';
const REG_PATH = process.env['REG_PATH'] ?? 'registration.yaml';

const config = loadConfig(CONFIG_PATH);
const pool = new Pool({ connectionString: config.database.url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const store = new SessionStore(prisma);
const client = new OpenclawClient({ url: config.openclaw.url, token: config.openclaw.token });
const agentSync = new AgentSyncService(client, store, config.homeserver.domain);
const queue = new RoomQueue();
const rateLimiter = new RateLimiter();

let controlRoomId: string | null = null;

/** Helper to send an m.notice message using the SDK's sendMessage. */
async function sendNotice(intent: Intent, roomId: string, text: string): Promise<void> {
  await intent.sendMessage(roomId, { msgtype: 'm.notice', body: text });
}

const bridge = createBridge(config, REG_PATH, async (req) => {
  const event = req.getData();
  if (!event) return;

  // Invite handling
  if (event['type'] === 'm.room.member' && (event['content'] as Record<string, unknown>)?.['membership'] === 'invite') {
    await handleInvite({
      roomId: event['room_id'] as string,
      invitedMxid: event['state_key'] as string,
      senderMxid: event['sender'] as string,
      domain: config.homeserver.domain,
      // The SDK Bridge satisfies the structural interface required by handleInvite
      bridge: bridge as unknown as Parameters<typeof handleInvite>[0]['bridge'],
      store,
      agentSync,
    });
    return;
  }

  // Message handling
  if (event['type'] === 'm.room.message' && (event['content'] as Record<string, unknown>)?.['msgtype'] === 'm.text') {
    const body = ((event['content'] as Record<string, unknown>)?.['body'] as string) ?? '';

    // Control-Room commands
    if (event['room_id'] === controlRoomId) {
      if (rateLimiter.isLimited(event['sender'] as string)) {
        const botIntent = bridge.getIntent() as Intent;
        await sendNotice(botIntent, event['room_id'] as string, 'Rate limit exceeded. Please wait a minute.');
        return;
      }
      const cmd = parseCommand(body);
      if (cmd) {
        await handleControlCommand(cmd, event['sender'] as string, event['room_id'] as string);
      }
      return;
    }

    // Regular agent room
    const room = await store.getRoom(event['room_id'] as string);
    if (!room) return;
    const agentMxid = agentIdToMxid(room.agentId, config.homeserver.domain);

    queue.enqueue(event['room_id'] as string, () =>
      handleMessage({
        roomId: event['room_id'] as string,
        senderMxid: event['sender'] as string,
        eventId: event['event_id'] as string,
        body,
        agentMxid,
        domain: config.homeserver.domain,
        store,
        client,
        // Cast to the structural Bridge interface expected by handleMessage
        bridge: bridge as unknown as Parameters<typeof handleMessage>[0]['bridge'],
        timeoutSeconds: config.openclaw.streamTimeoutSeconds,
        maxHistory: config.openclaw.maxHistoryMessages,
      }),
    );
  }
});

async function handleControlCommand(
  cmd: NonNullable<ReturnType<typeof parseCommand>>,
  senderMxid: string,
  roomId: string,
): Promise<void> {
  const botIntent = bridge.getIntent() as Intent;

  if (cmd.type === 'help') {
    await sendNotice(botIntent, roomId,
      'Commands:\n' +
      '!openclaw agents — list agents\n' +
      '!openclaw new <name> — create session room\n' +
      '!openclaw sessions — list your sessions\n' +
      '!openclaw help — this message',
    );
  } else if (cmd.type === 'agents') {
    const agents = agentSync.getKnownAgentIds();
    const lines = agents.map((id) =>
      `• ${id} → @${id.replace(/^openclaw\//, 'openclaw-')}:${config.homeserver.domain}`,
    );
    await sendNotice(botIntent, roomId, lines.length ? lines.join('\n') : 'No agents available.');
  } else if (cmd.type === 'sessions') {
    const rooms = await store.getRoomsByUser(senderMxid);
    const lines = rooms.map((r) => `• ${r.title ?? r.id} (${r.agentId})`);
    await sendNotice(botIntent, roomId, lines.length ? lines.join('\n') : 'No sessions found.');
  } else if (cmd.type === 'new') {
    const agentId = `openclaw/${cmd.name}`;
    if (!agentSync.isKnownAgent(agentId)) {
      const valid = agentSync.getKnownAgentIds().map((id) => id.replace(/^openclaw\//, '')).join(', ');
      await sendNotice(botIntent, roomId, `Unknown agent "${cmd.name}". Available: ${valid}`);
      return;
    }
    const agentMxid = agentIdToMxid(agentId, config.homeserver.domain);
    const title = `[${cmd.name}] Session ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    const agentIntent = bridge.getIntent(agentMxid) as Intent;
    const newRoom = await agentIntent.createRoom({
      createAsClient: true,
      options: { name: title, invite: [senderMxid] },
    });
    await store.createRoom({ id: (newRoom as { room_id: string }).room_id, agentId, matrixUserId: senderMxid, title });
    await sendNotice(botIntent, roomId, `Created room: ${title}`);
  }
}

async function ensureControlRoom(): Promise<void> {
  const botIntent = bridge.getIntent() as Intent;
  const stored = await store.getAppState('controlRoomId');
  if (stored) {
    try {
      await botIntent.resolveRoom(stored);
      controlRoomId = stored;
      return;
    } catch {
      await store.deleteAppState('controlRoomId');
    }
  }
  try {
    controlRoomId = await botIntent.resolveRoom(
      `#${config.appservice.controlRoomAlias}:${config.homeserver.domain}`,
    );
  } catch {
    const result = await botIntent.createRoom({
      createAsClient: true,
      options: { name: 'OpenClaw Control', aliases: [config.appservice.controlRoomAlias] },
    });
    controlRoomId = (result as { room_id: string }).room_id;
  }
  await botIntent.join(controlRoomId!);
  await store.setAppState('controlRoomId', controlRoomId!);
}

async function main(): Promise<void> {
  await agentSync.sync();
  await bridge.initialise();
  await (bridge.getIntent() as Intent).ensureRegistered();
  await ensureControlRoom();
  await bridge.listen(config.appservice.port, config.appservice.bindAddress);
  const _syncHandle = agentSync.startPeriodicSync(config.openclaw.agentSyncIntervalMinutes);
  console.log(`Appservice running on port ${config.appservice.port}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
