# matrix-appservice-openclaw

A [Matrix Application Service](https://spec.matrix.org/v1.9/application-service-api/) that bridges [Openclaw](https://openclaw.ai) AI agents into a Synapse homeserver. Each Openclaw agent appears as a real Matrix user; end users chat with agents directly in any Matrix client.

## Features

- Syncs Openclaw agents periodically and registers them as virtual Matrix users
- Routes messages from Matrix rooms to the Openclaw streaming chat API
- Maintains per-room conversation history in PostgreSQL
- Serialises messages per room (no interleaved replies)
- Idempotent event processing (Matrix `eventId` deduplication)
- Rate-limits commands in the control room
- Soft-deletes departed agents without breaking existing rooms

## Requirements

- Node.js ≥ 22
- PostgreSQL ≥ 14
- A running [Synapse](https://github.com/element-hq/synapse) homeserver with appservice support
- An Openclaw instance with a valid gateway token

## Installation

```bash
git clone https://github.com/your-org/matrix-appservice-openclaw.git
cd matrix-appservice-openclaw
npm install
```

### Database setup

Create a PostgreSQL database and run migrations:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/matrix_openclaw" \
  npx prisma migrate deploy
```

### Configuration

Copy the example config and fill in your values:

```bash
cp config.yaml.example config.yaml
```

```yaml
homeserver:
  url: "https://matrix.example.com"   # Synapse base URL
  domain: "example.com"               # server_name in homeserver.yaml

openclaw:
  url: "http://127.0.0.1:18789"       # Openclaw gateway URL
  token: "your-gateway-token"         # Bearer token for Openclaw API
  agentSyncIntervalMinutes: 10        # How often to re-sync agents
  streamTimeoutSeconds: 60            # SSE stream wall-clock timeout
  maxHistoryMessages: 50              # Messages sent as context per request

appservice:
  port: 9993                          # Port the appservice listens on
  bindAddress: "127.0.0.1"
  controlRoomAlias: "openclaw-control"

database:
  url: "postgresql://user:password@localhost:5432/matrix_openclaw"
```

### Generate registration

```bash
CONFIG_PATH=config.yaml REG_PATH=registration.yaml npx tsx src/register.ts
```

This creates `registration.yaml`. Re-running preserves existing `as_token` and `hs_token`.

### Register with Synapse

Add the registration file to your Synapse config (`homeserver.yaml`):

```yaml
app_service_config_files:
  - /path/to/registration.yaml
```

Restart Synapse after adding the file.

## Running

### Development

```bash
CONFIG_PATH=config.yaml REG_PATH=registration.yaml npm start
```

### Production (systemd)

Copy and enable the provided unit file:

```bash
sudo cp matrix-appservice-openclaw.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now matrix-appservice-openclaw
```

The unit file runs as the `martin` user by default. Edit `User=` to match your system before enabling.

## Control room

On first start the appservice creates a Matrix room aliased `#openclaw-control:<domain>` and invites the `sender_localpart` bot. Use any Matrix client to join this room.

Available commands:

| Command | Description |
|---------|-------------|
| `!sync` | Force an immediate agent sync |
| `!list` | List all active agents |
| `!help` | Show available commands |

Commands are rate-limited to 5 per minute per user.

## Architecture

```
Matrix client
    │  m.room.message / m.room.member
    ▼
Synapse homeserver
    │  appservice transaction
    ▼
matrix-appservice-openclaw
    ├── InviteHandler   – provisions agent rooms on invite
    ├── MessageHandler  – streams chat via Openclaw SSE API
    ├── ControlHandler  – !sync / !list commands
    ├── RoomQueue       – per-room serialisation
    └── SessionStore    – Prisma / PostgreSQL persistence
    │
    ▼
Openclaw gateway (SSE streaming chat API)
```

## Testing

```bash
# Unit + integration tests (requires DATABASE_URL)
DATABASE_URL="postgresql://..." npm test

# With coverage report
DATABASE_URL="postgresql://..." npm run test:coverage
```

Tests use real PostgreSQL — no mocks. Run `prisma migrate deploy` before the first test run.

## Configuration reference

| Key | Default | Description |
|-----|---------|-------------|
| `homeserver.url` | — | Synapse base URL (no trailing slash) |
| `homeserver.domain` | — | Matrix server name |
| `openclaw.url` | — | Openclaw gateway base URL |
| `openclaw.token` | — | Bearer token |
| `openclaw.agentSyncIntervalMinutes` | `10` | Agent sync cadence |
| `openclaw.streamTimeoutSeconds` | `60` | Per-request SSE timeout |
| `openclaw.maxHistoryMessages` | `50` | History window per request |
| `appservice.port` | `9993` | Listening port |
| `appservice.bindAddress` | `127.0.0.1` | Bind address |
| `appservice.controlRoomAlias` | `openclaw-control` | Control room local alias |
| `database.url` | — | PostgreSQL connection string |

## License

MIT — see [LICENSE](LICENSE).
