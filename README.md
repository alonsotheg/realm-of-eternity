# Realm of Eternity


A browser-based idle RPG game with combat, gathering, crafting, and progression systems built with vanilla HTML, CSS, and React.

## Features

### Combat System
- **4 Combat Skills**: Strength, Attack, Defense, Health
- **15+ Enemy Types** across 7 unique locations
- **Auto-Combat** and **Auto-Eat** features for AFK gameplay
- Equipment progression system (Bronze → Iron → Steel → Dragon → Elder)
- Dynamic combat calculations with buffs and equipment bonuses

### Gathering & Production
- **Mining**: Gather Copper, Iron, and Coal from caves
- **Woodcutting**: Chop trees for Wood in the forest
- **Fishing**: Catch Shrimp, Trout, and Salmon at fishing ponds
- **Herblore**: Gather 12 different herbs across various locations
- **Cooking**: Prepare food to heal during combat
- **Smithing**: Craft weapons and armor from ores
- **Farming**: Grow crops at your home (NEW!)

### Home System (NEW!)
- **Build Homes** at any location with 3 upgrade tiers
- **Farming Plots**: Grow 9 types of crops for food
- **Home Storage**: Store items in location-based inventories
- **Offline Growth**: Crops continue growing while you're away
- **Tier Requirements**: Progress unlocks better homes (25/50/100 total level)

### Herblore & Potions System
- **12 Unique Herbs** found across different locations
- **18 Potion Types** including:
  - Healing Potions (instant HP restore)
  - Combat Buff Potions (attack, defense, vitality)
  - Skilling Buff Potions (speed, XP, efficiency)
  - Utility Potions (drop rates, AFK time, focus)
- Active buff system with duration timers
- Strategic potion usage for combat and skilling

### Locations
1. **Starter Village** - Goblins, Bats, Wolves
2. **Forest** - Woodcutting, Herblore, Goblin Captains/Generals
3. **Cave** - Mining, Herblore, Ogres, Rock Crabs
4. **Fishing Pond** - Fishing, Herblore, Giant Frogs
5. **Volcanic Plain** - Herblore, Ash Drakes
6. **Mountains** - Herblore, Golems, Dragons, Elder Dragons
7. **Blacksmith** - Equipment crafting

### Loot & Progression
- **3 Chest Types**: Wooden, Iron, and Golden chests with weighted loot tables
- Equipment blueprints and rare drops
- Familiar pets (Stone, Dragon, Elder)
- Progressive difficulty scaling

### UI Features
- **Scene Panel**: Atmospheric background images for each location and activity
- **Map Navigation**: Interactive island map for traveling between connected locations
- **Active Buffs Display**: Track potion effects with timers
- **Inventory Management**: Tooltips, equipment comparison, consumables
- **Combat Log**: Detailed action history with filtering
- **Stats Panel**: Real-time character statistics

## Getting Started

### Quick Start (Local Development)
1. Clone this repository
2. Install dependencies: `npm install`
3. Create environment file: `copy .env.example .env` (Windows) or `cp .env.example .env` (Mac/Linux)
4. Edit `.env` and set `JWT_SECRET` to any secure string
5. Start the server: `npm start`
6. Open http://localhost:3000 in your browser

### Requirements
- Node.js 18+
- Modern web browser (Chrome, Firefox, Edge, Safari)
- JavaScript enabled

### Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT token signing |
| `PORT` | No | 3000 | Server port |

## Deployment

### Free Hosting Providers
This server is ready for deployment on free hosting providers:

**Render.com:**
1. Connect your GitHub repository
2. Set environment variable: `JWT_SECRET`
3. Build command: `npm install`
4. Start command: `npm start`

**Railway.app:**
1. Connect your GitHub repository
2. Add environment variable: `JWT_SECRET`
3. Railway auto-detects Node.js and deploys

### Important Notes
- Set a strong, unique `JWT_SECRET` in production
- The `./data` directory stores user accounts and saves
- Graceful shutdown ensures saves complete before restart

## Documentation

- **[MOBS_README.md](MOBS_README.md)** - Complete game reference with enemy stats, drops, skills, and mechanics
- **[ASSET_GUIDE.md](ASSET_GUIDE.md)** - Asset management guide for adding/updating images
- **[SCENE_GUIDE.md](SCENE_GUIDE.md)** - Scene image specifications and file naming
>>>>>>> 80a1b75f7cbfc3ab1f96974d677ba8381f2dc57d

## Project Structure

```
<<<<<<< HEAD
/
├── Game/                 # Unreal Engine 5 Project
├── Server/               # Multiplayer game server
│   └── src/              # Server source code
├── Docs/                 # Game design documents
├── Data/                 # Game data configuration
│   ├── Items/            # Item definitions
│   ├── Skills/           # Skill trees and progression
│   ├── Npcs/             # NPC definitions
│   ├── Quests/           # Quest definitions
│   └── World/            # World/zone configurations
└── Tools/                # Build and development tools
```

## Technology Stack

- **Game Engine**: Unreal Engine 5.4+
- **Game Server**: C++ / Node.js dedicated server
- **Database**: PostgreSQL for persistent data
- **Networking**: Custom UDP protocol + WebSocket fallback

## Getting Started

### Prerequisites
- Unreal Engine 5.4 or later
- Visual Studio 2022 (Windows) or Xcode (Mac)
- Node.js 20+ (for server development)
- PostgreSQL 15+

### Setup

1. Clone this repository
2. Open `Game/RealmOfEternity.uproject` in Unreal Engine
3. Set up the server (see `Server/README.md`)
4. Configure your database connection

## Development Status

🚧 **Pre-Alpha** - Foundation and core systems in development

## License

Proprietary - All rights reserved
=======
realm-of-eternity/
├── server.js                # Backend server (Express.js)
├── package.json             # Dependencies and scripts
├── .env.example             # Environment variable template
├── .gitignore               # Git ignore rules
├── realmofeternity.html     # Main game file (frontend)
├── README.md                # This file
├── MOBS_README.md           # Game reference documentation
├── ASSET_GUIDE.md           # Asset creation guide
├── SCENE_GUIDE.md           # Scene image specifications
├── data/                    # Server data (auto-created)
│   ├── users.json           # User accounts
│   ├── saves.json           # Game saves
│   └── locations.json       # Player locations (multiplayer)
└── assets/
    ├── items.json           # Item asset manifest
    ├── items/               # Item images (64x64 PNG)
    └── scenes/              # Scene backgrounds (800x400 PNG)
```

## Game Mechanics

### Combat Calculations
- **Attack Power** = (Strength × 20) + (Attack × 10) + Equipment + Potion Buffs
- **Damage Reduction** = (Defense × 2%, capped at 50%) + Equipment + Potion Buffs
- **Experience** = Full EXP to combat skill, 1/3 to Health skill

### Gathering Speed
- Base gathering time modified by tools and potions
- Bonuses stack multiplicatively
- Rare drops possible (chests, gems, seeds)

### Home & Farming System
- Build homes at any location (requires wood + total level)
- 3 tiers: Tier 1 (25 lvl, 2000 wood), Tier 2 (50 lvl, 5000 wood), Tier 3 (100 lvl, 10000 wood)
- Farm plots unlock based on tier (50/100/250 plots)
- Home storage slots per tier (25/50/75 unique item types)
- Crops grow in real-time (including offline)
- Harvest crops for Farming XP and consumable food

### Auto-Eat System
- Configure HP threshold (1-100%)
- Select food type (Shrimp, Trout, Salmon, Frog Legs, or Potions)
- Automatically consumes food when HP drops below threshold
- Works during combat

## Technical Details

### Frontend
- **Framework**: React (via CDN)
- **Styling**: Tailwind CSS (via CDN)
- **Architecture**: Single-file HTML application
- **State Management**: React hooks (useState, useEffect, useRef)
- **No Build Process**: Open and play directly in browser

### Backend
- **Runtime**: Node.js with Express.js
- **Authentication**: JWT tokens (30-day expiry)
- **Password Security**: bcrypt hashing
- **Data Storage**: JSON files (./data/)
- **Save System**: Atomic writes with file locking
- **Graceful Shutdown**: Completes pending saves on SIGTERM/SIGINT

## Future Enhancement Ideas

- [ ] Add more locations and enemies
- [ ] Implement PvP arena system
- [ ] Add quest system
- [ ] Multiplayer trading
- [ ] Prestige/rebirth mechanics
- [ ] Achievement system
- [ ] Sound effects and music
- [ ] Mobile-responsive design improvements

## Contributing

Feel free to fork this project and submit pull requests for:
- Bug fixes
- New features
- Balance adjustments
- UI/UX improvements
- Documentation updates

## License

This project is open source and available for personal and educational use.

## Credits

Game concept inspired by classic idle/incremental RPGs and games like RuneScape.

Built with assistance from Claude (Anthropic).
