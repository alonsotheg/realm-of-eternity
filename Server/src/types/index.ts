/**
 * Core Type Definitions
 */

import { WebSocket } from 'ws';

// === Player Types ===

export interface Player {
  id: string;
  socket: WebSocket;
  accountId?: string;
  characterId?: string;
  character?: Character;
  zoneId: number;
  lastUpdate: number;
}

export interface Character {
  id: string;
  name: string;
  race: Race;
  position: Vector3;
  rotation: number;
  stats: CharacterStats;
  skills: Map<SkillType, SkillProgress>;
  appearance: CharacterAppearance;
}

export interface CharacterStats {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  adrenaline: number;
  strength: number;
  agility: number;
  vitality: number;
  intelligence: number;
  wisdom: number;
  luck: number;
}

export interface CharacterAppearance {
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  faceShape: number;
  bodyType: number;
}

export type Race = 'human' | 'elf' | 'dwarf' | 'orc' | 'feline' | 'scaled';

// === Skill Types ===

export type SkillType =
  // Combat
  | 'melee'
  | 'ranged'
  | 'magic'
  | 'defense'
  | 'prayer'
  // Gathering
  | 'mining'
  | 'woodcutting'
  | 'fishing'
  | 'hunting'
  | 'farming'
  | 'foraging'
  // Crafting
  | 'smithing'
  | 'fletching'
  | 'crafting'
  | 'cooking'
  | 'alchemy'
  | 'enchanting'
  | 'construction'
  // Support
  | 'thieving'
  | 'agility'
  | 'slayer'
  | 'dungeoneering';

export interface SkillProgress {
  level: number;
  experience: number;
}

// === World Types ===

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Zone {
  id: number;
  name: string;
  minLevel: number;
  maxLevel: number;
  bounds: ZoneBounds;
  players: Set<string>;
}

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

// === Network Types ===

export enum PacketType {
  // System
  PING = 0x01,
  PONG = 0x02,
  AUTH = 0x03,
  AUTH_RESPONSE = 0x04,

  // Movement
  MOVE = 0x10,
  MOVE_SYNC = 0x11,
  TELEPORT = 0x12,

  // Combat
  ATTACK = 0x20,
  DAMAGE = 0x21,
  DEATH = 0x22,
  RESPAWN = 0x23,

  // Skills
  SKILL_ACTION = 0x30,
  SKILL_XP = 0x31,
  SKILL_LEVEL = 0x32,

  // Items
  ITEM_PICKUP = 0x40,
  ITEM_DROP = 0x41,
  ITEM_USE = 0x42,
  INVENTORY_UPDATE = 0x43,

  // Chat
  CHAT_MESSAGE = 0x50,
  CHAT_BROADCAST = 0x51,

  // NPCs
  NPC_SPAWN = 0x60,
  NPC_DESPAWN = 0x61,
  NPC_UPDATE = 0x62,
  NPC_INTERACT = 0x63,

  // Players
  PLAYER_SPAWN = 0x70,
  PLAYER_DESPAWN = 0x71,
  PLAYER_UPDATE = 0x72,
}

export interface Packet {
  type: PacketType;
  sequence: number;
  payload: Buffer;
}

// === Item Types ===

export interface Item {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  stackable: boolean;
  maxStack: number;
  value: number;
  requirements?: ItemRequirements;
  stats?: ItemStats;
}

export type ItemType =
  | 'weapon'
  | 'armor'
  | 'tool'
  | 'consumable'
  | 'material'
  | 'quest'
  | 'currency';

export interface ItemRequirements {
  skills?: Partial<Record<SkillType, number>>;
  quests?: string[];
}

export interface ItemStats {
  attackBonus?: number;
  defenseBonus?: number;
  magicBonus?: number;
  healthBonus?: number;
  manaBonus?: number;
}

// === NPC Types ===

export interface NPC {
  id: string;
  templateId: string;
  name: string;
  position: Vector3;
  rotation: number;
  health: number;
  maxHealth: number;
  level: number;
  hostile: boolean;
  respawnTime: number;
}
