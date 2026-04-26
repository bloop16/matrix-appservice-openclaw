# matrix-appservice-openclaw

A [Matrix Application Service](https://spec.matrix.org/v1.9/application-service-api/) that bridges [Openclaw](https://openclaw.ai) AI agents into a Synapse homeserver. Each Openclaw agent appears as a real Matrix user; end users chat with agents directly in any Matrix client.

DEVELOPED with Claude and Superpowers

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
  # Can be a remote host — Openclaw does not need to run on the same machine
  url: "http://openclaw.example.com:18789"
  token: "your-gateway-token"         # Bearer token for Openclaw API
  agentSyncIntervalMinutes: 10        # How often to re-sync agents
  streamTimeoutSeconds: 60            # SSE stream wall-clock timeout

appservice:
  port: 9993                          # Port the appservice listens on
  # Use "127.0.0.1" when Synapse runs on the same machine (recommended).
  # Use "0.0.0.0" (or a specific interface IP) when Synapse is on a different host.
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

A template unit file is provided. Copy and adapt it to your system:

```bash
cp matrix-appservice-openclaw.service.example matrix-appservice-openclaw.service
```

Edit the file and replace every `<YOUR_USER>` and `/path/to/matrix-appservice-openclaw` with the actual user and installation path, then install:

```bash
sudo cp matrix-appservice-openclaw.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now matrix-appservice-openclaw
```

## Control room

On first start the appservice fully bootstraps the control room automatically:

1. Registers the bot user if it does not exist yet
2. Resolves or creates a room aliased `#openclaw-control:<domain>`
3. Joins the room as the bot user

No manual admin steps are required. Use any Matrix client to join the same room.

Available commands:

| Command | Description |
|---------|-------------|
| `!openclaw agents` | List all active agents |
| `!openclaw new <name>` | Create a new session room with an agent |
| `!openclaw sessions` | List your open session rooms |
| `!openclaw help` | Show available commands |

Commands are rate-limited to 10 per minute per user.

## Deployment topology

All three components (Synapse, this appservice, Openclaw) can run on different hosts:

| Component | Network requirement |
|-----------|---------------------|
| **Synapse → appservice** | Synapse calls `appservice.port` — must be reachable from Synapse's host. Set `bindAddress: "0.0.0.0"` and open the port if they are on different machines. |
| **Appservice → Synapse** | Outbound HTTPS to `homeserver.url` from the appservice host. |
| **Appservice → Openclaw** | Outbound HTTP/HTTPS to `openclaw.url` from the appservice host. |
| **Appservice → PostgreSQL** | Outbound TCP to the database. `database.url` can point to any reachable PostgreSQL host. |

Typical single-host setup: `bindAddress: "127.0.0.1"` (default). Synapse and the appservice share `localhost`.

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
| `appservice.port` | `9993` | Listening port |
| `appservice.bindAddress` | `127.0.0.1` | Bind address — set to `0.0.0.0` if Synapse is on a different host |
| `appservice.controlRoomAlias` | `openclaw-control` | Control room local alias |
| `database.url` | — | PostgreSQL connection string |

## License

MIT — see [LICENSE](LICENSE).
