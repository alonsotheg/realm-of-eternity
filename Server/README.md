# Realm of Eternity - Game Server

Multiplayer game server for Realm of Eternity MMO.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file and configure:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Set up database:
```bash
npm run db:migrate
npm run db:generate
```

4. Run in development mode:
```bash
npm run dev
```

## Architecture

```
src/
├── index.ts           # Entry point
├── config.ts          # Configuration
├── core/
│   └── game-loop.ts   # Main simulation loop
├── managers/
│   ├── player-manager.ts   # Player connections
│   └── zone-manager.ts     # World zones
├── network/
│   └── packet-handler.ts   # Network protocol
└── types/
    └── index.ts       # Type definitions
```

## Network Protocol

The server uses a custom binary protocol over WebSocket:

| Field | Size | Description |
|-------|------|-------------|
| Length | 2 bytes | Total packet length |
| Type | 2 bytes | Packet type ID |
| Sequence | 4 bytes | Sequence number |
| Payload | variable | Packet data |

## Scripts

- `npm run dev` - Start with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled server
- `npm test` - Run tests
- `npm run lint` - Lint code

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| HOST | 0.0.0.0 | Bind address |
| PORT | 7777 | Server port |
| TICK_RATE | 20 | Game ticks per second |
| DATABASE_URL | - | PostgreSQL connection |
| REDIS_URL | - | Redis connection |
| JWT_SECRET | - | Auth token secret |
