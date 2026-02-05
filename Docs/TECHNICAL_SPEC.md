# Technical Specification

## Unreal Engine 5 Project Setup

### Required Plugins
- **Gameplay Ability System (GAS)** - For abilities and stats
- **Enhanced Input** - Modern input handling
- **Common UI** - Cross-platform UI
- **Online Subsystem** - Multiplayer foundation

### Project Settings

#### Rendering
```
r.Nanite = 1
r.Lumen.Enabled = 1
r.VirtualShadowMaps = 1
r.Streaming.PoolSize = 4000
```

#### World Partition
- Enable World Partition for seamless streaming
- Cell size: 12800 units (128m)
- Loading range: 3 cells

### Folder Structure (UE5)
```
Game/
├── Content/
│   ├── Characters/
│   │   ├── Player/
│   │   └── NPCs/
│   ├── Environments/
│   │   ├── Landscapes/
│   │   ├── Props/
│   │   └── Foliage/
│   ├── VFX/
│   ├── Audio/
│   ├── UI/
│   ├── Materials/
│   ├── Blueprints/
│   │   ├── Core/
│   │   ├── Abilities/
│   │   ├── Items/
│   │   └── NPCs/
│   └── Data/
│       ├── DataTables/
│       └── DataAssets/
├── Source/
│   └── RealmOfEternity/
│       ├── Core/
│       ├── Character/
│       ├── Combat/
│       ├── Skills/
│       ├── Items/
│       ├── Network/
│       └── UI/
└── Config/
```

## Server Architecture

### Technology Stack
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Custom game server (not HTTP-based)
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Message Queue**: Redis Streams

### Server Types

#### Gateway Server
- Handles authentication
- Routes players to zone servers
- Manages global chat
- Tracks player locations

#### Zone Server
- Manages a world region
- Handles gameplay simulation
- NPC AI processing
- Collision and physics

#### World Server
- Coordinates zone servers
- Manages world events
- Handles cross-zone travel

### Network Protocol

#### Packet Structure
```
┌────────────┬────────────┬────────────┬────────────┐
│  Length    │  Type      │  Sequence  │  Payload   │
│  (2 bytes) │  (2 bytes) │  (4 bytes) │  (variable)│
└────────────┴────────────┴────────────┴────────────┘
```

#### Key Packet Types
| ID | Name | Direction | Description |
|----|------|-----------|-------------|
| 0x01 | PING | Both | Keepalive |
| 0x02 | MOVE | C→S | Player movement |
| 0x03 | MOVE_SYNC | S→C | Position sync |
| 0x10 | ATTACK | C→S | Attack action |
| 0x11 | DAMAGE | S→C | Damage event |
| 0x20 | CHAT | Both | Chat message |

## Database Schema

### Core Tables

```sql
-- Accounts
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active'
);

-- Characters
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES accounts(id),
    name VARCHAR(30) UNIQUE NOT NULL,
    race VARCHAR(20) NOT NULL,
    appearance JSONB,
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    position_z FLOAT DEFAULT 0,
    zone_id INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    play_time INTEGER DEFAULT 0
);

-- Skills
CREATE TABLE character_skills (
    character_id UUID REFERENCES characters(id),
    skill_id VARCHAR(30),
    level INTEGER DEFAULT 1,
    experience BIGINT DEFAULT 0,
    PRIMARY KEY (character_id, skill_id)
);

-- Inventory
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID REFERENCES characters(id),
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER DEFAULT 1,
    slot INTEGER,
    container VARCHAR(20) DEFAULT 'backpack',
    metadata JSONB
);

-- Bank
CREATE TABLE bank_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID REFERENCES characters(id),
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER DEFAULT 1,
    tab INTEGER DEFAULT 0,
    slot INTEGER
);
```

## API Endpoints (REST for account management)

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login, get token
- `POST /api/auth/logout` - Invalidate token
- `POST /api/auth/refresh` - Refresh token

### Characters
- `GET /api/characters` - List characters
- `POST /api/characters` - Create character
- `DELETE /api/characters/:id` - Delete character

### Game Server Connection
- WebSocket upgrade at `/ws/game`
- UDP endpoint at `game.server:7777`

## Performance Targets

| Metric | Target |
|--------|--------|
| Client FPS | 60 (console), 144+ (PC) |
| Server Tick | 20 Hz |
| Player Capacity | 2000 per zone |
| World Size | 64 km² |
| Asset Streaming | < 1s pop-in |
| Login Time | < 5s |
