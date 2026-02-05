# Realm of Eternity - Game Design Document

**Version**: 0.1.0
**Last Updated**: 2026-01-07
**Status**: Pre-Production

---

## Table of Contents
1. [Vision & Overview](#vision--overview)
2. [Core Pillars](#core-pillars)
3. [World Design](#world-design)
4. [Character System](#character-system)
5. [Skills & Progression](#skills--progression)
6. [Combat System](#combat-system)
7. [Gathering & Crafting](#gathering--crafting)
8. [Economy & Trading](#economy--trading)
9. [Quests & Narrative](#quests--narrative)
10. [Social Systems](#social-systems)
11. [Technical Architecture](#technical-architecture)

---

## Vision & Overview

### High Concept
**Realm of Eternity** is an open-world MMORPG that combines the addictive progression systems and player freedom of classic sandbox MMOs with modern AAA graphics powered by Unreal Engine 5. Players inhabit a living fantasy world where they can pursue any path: become a master blacksmith, a legendary warrior, a wealthy merchant, or anything in between.

### Target Experience
- **Satisfying Grind**: Progress should feel meaningful and rewarding
- **True Freedom**: No class restrictions - train any skill, pursue any path
- **Social World**: A living economy and community-driven gameplay
- **Visual Beauty**: Modern graphics that bring the world to life
- **Accessible Depth**: Easy to learn, endless to master

### Unique Selling Points
1. **Classless Progression** - Train any combination of skills
2. **Living Economy** - All items crafted by players, real supply/demand
3. **Modern Graphics** - UE5 Nanite, Lumen, and stunning environments
4. **Meaningful Choices** - Actions have consequences in the world
5. **Respects Your Time** - Progress is saved, no artificial time gates

---

## Core Pillars

### 1. Freedom
Players are never locked into a class or role. Every skill is available to every player. Want to be a mining wizard who also pickpockets? Go for it.

### 2. Progression
Every action should feel like progress. Clear feedback loops, visible improvement, and tangible rewards for time invested.

### 3. Economy
A player-driven economy where supply and demand actually matter. Crafters are essential. Gatherers are valued. Traders can prosper.

### 4. Community
Designed for social play without requiring it. Solo players can thrive, but grouping offers unique advantages and content.

### 5. Exploration
A vast world full of secrets, hidden areas, and discoveries that reward the curious.

---

## World Design

### The Continent of Aethermoor

A massive seamless world divided into distinct regions:

#### Regions

| Region | Level Range | Biome | Key Features |
|--------|-------------|-------|--------------|
| **Sunhaven Valley** | 1-20 | Temperate Meadows | Starting area, tutorials, basic resources |
| **Ironwood Forest** | 15-40 | Dense Woodland | Logging, hunting, ancient ruins |
| **Dustfall Desert** | 30-60 | Arid Wasteland | Mining, archaeology, bandit camps |
| **Frostpeak Mountains** | 50-80 | Alpine Tundra | Rare ores, ice dungeons, dwarven cities |
| **Shadowmire Swamp** | 45-70 | Dark Wetlands | Alchemy ingredients, dark magic, undead |
| **Crimson Coast** | 40-75 | Volcanic Islands | Fishing, sailing, sea monsters |
| **The Verdant Highlands** | 60-90 | Mystical Plateau | High-level content, magical resources |
| **The Abyss** | 80-100 | Underground Realm | Endgame content, rarest materials |

#### Points of Interest
- **Major Cities** (5): Trading hubs, banks, guilds
- **Towns** (15): Regional services, local quests
- **Dungeons** (20+): Instanced and open-world
- **World Bosses** (10): Scheduled spawns, server-wide events
- **Hidden Areas** (50+): Secrets for explorers

### Day/Night Cycle
- Full 2-hour real-time cycle
- Certain creatures/events only at night
- Visual and gameplay changes

### Weather System
- Dynamic weather affects gameplay
- Rain boosts fishing, hinders fire magic
- Storms reveal hidden areas

---

## Character System

### Character Creation

#### Races (Cosmetic Only)
No stat differences - purely aesthetic choice:

1. **Human** - Versatile appearance options
2. **Elf** - Slender, pointed ears, ethereal
3. **Dwarf** - Stout, bearded, rugged
4. **Orc** - Muscular, tusked, intimidating
5. **Feline** - Cat-like humanoids
6. **Scaled** - Reptilian humanoids

#### Appearance
- Extensive customization
- Face, hair, body type, markings, scars
- Dyes and transmog for equipment

### Stats

#### Primary Attributes
| Attribute | Effect |
|-----------|--------|
| **Strength** | Melee damage, carry weight |
| **Agility** | Attack speed, dodge chance |
| **Vitality** | Health pool, health regen |
| **Intelligence** | Magic damage, mana pool |
| **Wisdom** | Mana regen, skill XP bonus |
| **Luck** | Rare drops, critical chance |

#### Derived Stats
- Health = Vitality × 10 + Level × 5
- Mana = Intelligence × 8 + Level × 3
- Attack Power = Strength + Weapon Bonus
- Magic Power = Intelligence + Staff Bonus

### Leveling
- **Combat Level**: Calculated from combat skills
- **Total Level**: Sum of all skill levels
- No overall level cap - individual skill caps at 99 (120 for mastery)

---

## Skills & Progression

### Skill Categories

#### Combat Skills
| Skill | Description | Primary Stat |
|-------|-------------|--------------|
| **Melee** | Sword, axe, mace proficiency | Strength |
| **Ranged** | Bows, crossbows, thrown weapons | Agility |
| **Magic** | Elemental spells, utility magic | Intelligence |
| **Defense** | Armor proficiency, blocking | Vitality |
| **Prayer** | Divine buffs and abilities | Wisdom |

#### Gathering Skills
| Skill | Description | Yields |
|-------|-------------|--------|
| **Mining** | Extract ores and gems | Metals, gems |
| **Woodcutting** | Harvest trees | Logs, sap |
| **Fishing** | Catch fish and sea creatures | Fish, treasures |
| **Hunting** | Track and trap animals | Hides, meat |
| **Farming** | Grow crops and herbs | Produce, seeds |
| **Foraging** | Find wild plants | Herbs, berries |

#### Crafting Skills
| Skill | Description | Creates |
|-------|-------------|---------|
| **Smithing** | Forge weapons and armor | Metal gear |
| **Fletching** | Create bows and arrows | Ranged weapons |
| **Crafting** | Leather and jewelry | Accessories |
| **Cooking** | Prepare food buffs | Consumables |
| **Alchemy** | Brew potions | Potions |
| **Enchanting** | Add magical properties | Enchantments |
| **Construction** | Build player housing | Structures |

#### Support Skills
| Skill | Description | Benefits |
|-------|-------------|----------|
| **Thieving** | Pickpocket and lockpick | Gold, items |
| **Agility** | Movement and shortcuts | Stamina, paths |
| **Slayer** | Hunt specific monsters | Special drops |
| **Dungeoneering** | Procedural dungeons | Tokens, gear |

### XP System
- Actions grant XP based on difficulty and success
- Higher level actions = more XP
- XP curve follows: `XP_to_level = floor(level^2 * 100)`
- Bonus XP for variety (skill rotation bonus)

### Milestones
Every 10 levels unlock:
- New gathering nodes
- New crafting recipes
- New abilities
- Cosmetic rewards

---

## Combat System

### Combat Style
- **Action-oriented** with targeted abilities
- **Hybrid lock-on**: Soft lock with manual aiming
- **Skill-based**: Timing and positioning matter

### Attack Types
1. **Basic Attacks** - Auto-attack chain
2. **Abilities** - Skill-based moves (cooldowns)
3. **Special Attacks** - Resource consumers (adrenaline)
4. **Ultimate** - Long cooldown, high impact

### Damage Types
- **Physical**: Slashing, Piercing, Blunt
- **Magical**: Fire, Ice, Lightning, Nature, Shadow, Holy

### Combat Resources
| Resource | Generation | Usage |
|----------|------------|-------|
| **Health** | Regen, food, potions | Don't let it hit 0 |
| **Mana** | Regen, potions | Spells, some abilities |
| **Adrenaline** | Build in combat | Special attacks |
| **Prayer Points** | Slow regen | Divine abilities |

### Death & Penalties
- **Safe Deaths** (tutorial, minigames): No penalty
- **Normal Deaths**: Drop percentage of carried items
- **Hardcore Mode** (optional): Permadeath character

---

## Gathering & Crafting

### Gathering Philosophy
- Resources respawn on timers
- Competition for nodes (first-come)
- Rare resource spawns at random
- Tool quality affects yield

### Resource Tiers

| Tier | Level | Examples |
|------|-------|----------|
| Basic | 1-20 | Copper, Oak, Sardines |
| Intermediate | 20-40 | Iron, Maple, Trout |
| Advanced | 40-60 | Mithril, Yew, Lobster |
| Expert | 60-80 | Adamant, Magic, Shark |
| Master | 80-99 | Runite, Elder, Rocktail |
| Legendary | 99+ | Dragon, Sacred, Leviathan |

### Crafting Philosophy
- All gear crafted by players
- No vendor gear past level 10
- Crafters are essential to economy
- Quality variations based on skill

### Crafting Process
1. Gather raw materials
2. Process materials (smelt ore → bars)
3. Craft base item
4. (Optional) Enhance/enchant
5. Trade or use

---

## Economy & Trading

### Currency
- **Gold Coins** - Primary currency
- **Tokens** - Activity-specific (dungeon tokens, PvP tokens)
- **Premium Currency** - Cosmetics only (no P2W)

### Trading Systems

#### Grand Exchange
- Central marketplace
- Buy/sell orders
- Price history and trends
- 2% transaction tax (gold sink)

#### Direct Trade
- Face-to-face trading
- No fees
- Scam prevention UI

#### Auction House
- Rare item auctions
- Time-limited bidding

### Economic Sinks
- Repair costs
- Death penalties
- Construction materials
- Transaction taxes
- Consumables

### Economic Sources
- Monster drops (gold)
- Alchemy (convert items to gold)
- Quest rewards
- Achievement rewards

---

## Quests & Narrative

### Quest Types

#### Main Story Quests
- Epic narrative arc
- Major world events
- Unlock key areas/features
- Fully voiced

#### Side Quests
- Regional stories
- NPC relationships
- Skill unlocks
- Partially voiced

#### Daily/Weekly Challenges
- Rotating objectives
- Bonus XP rewards
- Community goals

#### World Events
- Server-wide events
- Limited time content
- Unique rewards

### Quest Design Principles
- Multiple solutions when possible
- Skill checks (use your skills!)
- Meaningful choices
- Lore-rich content
- Minimal fetch quests

---

## Social Systems

### Guilds (Clans)
- Up to 500 members
- Guild bank and storage
- Guild halls (buildable)
- Guild achievements
- Weekly guild events

### Friends & Groups
- Friends list with online status
- Party system (up to 5)
- Raid groups (up to 20)
- Private messaging

### Communication
- Local chat (proximity)
- Global channels (trade, LFG)
- Guild chat
- Private messages
- Emotes and gestures

### Player Housing
- Personal plots in housing zones
- Fully customizable buildings
- Functional rooms (storage, altar, garden)
- Guest permissions
- Guild territories

---

## Technical Architecture

### Client (Unreal Engine 5)
- **Rendering**: Nanite, Lumen, Virtual Shadow Maps
- **Streaming**: World Partition for seamless world
- **Animation**: Motion Matching for fluid movement
- **Audio**: MetaSounds for dynamic audio

### Server Architecture
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Gateway   │────▶│  Zone Server│
│   (UE5)     │◀────│   Server    │◀────│   Cluster   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Database   │
                    │ (PostgreSQL)│
                    └─────────────┘
```

### Networking
- **Protocol**: Custom UDP with reliability layer
- **Tick Rate**: 20Hz server, 60Hz client prediction
- **Sync**: Authoritative server, client prediction

### Database Schema (Core)
- `accounts` - Login, authentication
- `characters` - Character data
- `inventories` - Item storage
- `skills` - Skill progress
- `quests` - Quest progress
- `guilds` - Guild data
- `transactions` - Economy audit

### Scalability
- Horizontal zone server scaling
- Redis for session/cache
- CDN for assets
- Regional deployments

---

## Development Roadmap

### Phase 1: Foundation (Current)
- [ ] Core movement and controls
- [ ] Basic combat prototype
- [ ] 3 skills functional
- [ ] Small test zone

### Phase 2: Core Loop
- [ ] Full skill system
- [ ] Basic crafting
- [ ] Economy foundation
- [ ] Character persistence

### Phase 3: World Building
- [ ] First region complete
- [ ] 10 quests playable
- [ ] Housing system
- [ ] Guild basics

### Phase 4: Alpha
- [ ] 3 regions
- [ ] Full combat system
- [ ] Dungeon system
- [ ] Closed testing

### Phase 5: Beta
- [ ] Full world
- [ ] Polished systems
- [ ] Open beta testing

### Phase 6: Launch
- [ ] Full release
- [ ] Live operations

---

## Appendix

### Design Philosophy
- **Skill Freedom**: No class restrictions, train any skill
- **Player Economy**: All gear crafted by players
- **Modern Graphics**: AAA visuals with Unreal Engine 5
- **Exploration Rewards**: Secrets and discoveries everywhere
- **Crafting Satisfaction**: Meaningful progression through creation

### Competitive Analysis
| Feature | Realm of Eternity | Traditional MMOs | Action MMOs |
|---------|-------------------|------------------|-------------|
| Classless | ✓ | Rarely | ✗ |
| Modern Graphics | ✓ | Varies | ✓ |
| Player Economy | ✓ | Limited | Some |
| Action Combat | ✓ | Usually Tab-Target | ✓ |
| Skill-Based Progression | ✓ | Level-Based | Mixed |

---

*This is a living document. Update as design evolves.*
