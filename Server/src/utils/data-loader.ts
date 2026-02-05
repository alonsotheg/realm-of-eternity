/**
 * Data Loader
 *
 * Loads game data from JSON files.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { NPCTemplate } from '../world/npc-manager.js';
import { ResourceTemplate } from '../world/resource-manager.js';

export interface GameData {
  npcs: NPCTemplate[];
  resources: ResourceTemplate[];
  items: any[];
  skills: any[];
}

const DATA_PATH = join(process.cwd(), '..', 'Data');

/**
 * Load all game data
 */
export async function loadGameData(): Promise<GameData> {
  console.log('[DataLoader] Loading game data from', DATA_PATH);

  const npcs = loadNPCs();
  const resources = loadResources();
  const items = loadItems();
  const skills = loadSkills();

  console.log('[DataLoader] Loaded:');
  console.log(`  - ${npcs.length} NPCs`);
  console.log(`  - ${resources.length} Resources`);
  console.log(`  - ${items.length} Items`);
  console.log(`  - ${skills.length} Skills`);

  return { npcs, resources, items, skills };
}

/**
 * Load NPC templates
 */
function loadNPCs(): NPCTemplate[] {
  const filePath = join(DATA_PATH, 'Npcs', 'enemies.json');

  if (!existsSync(filePath)) {
    console.warn('[DataLoader] NPCs file not found, using defaults');
    return getDefaultNPCs();
  }

  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return data.enemies.map((e: any) => ({
      id: e.id,
      name: e.name,
      level: e.level,
      health: e.health,
      attackStyle: e.attackStyle,
      aggressive: e.aggressive,
      respawnTime: e.respawnTime,
      stats: e.stats,
      abilities: e.abilities,
      drops: e.drops.map((d: any) => ({
        itemId: d.item,
        quantity: d.quantity,
        chance: d.chance,
      })),
    }));
  } catch (error) {
    console.error('[DataLoader] Error loading NPCs:', error);
    return getDefaultNPCs();
  }
}

/**
 * Load resource templates
 */
function loadResources(): ResourceTemplate[] {
  // Resources will be defined here or loaded from files
  return getDefaultResources();
}

/**
 * Load item definitions
 */
function loadItems(): any[] {
  const weapons = loadJsonFile(join(DATA_PATH, 'Items', 'weapons.json'), { weapons: [] });
  const materials = loadJsonFile(join(DATA_PATH, 'Items', 'materials.json'), { materials: [] });

  return [...(weapons.weapons || []), ...(materials.materials || [])];
}

/**
 * Load skill definitions
 */
function loadSkills(): any[] {
  const data = loadJsonFile(join(DATA_PATH, 'Skills', 'skills.json'), { skills: [] });
  return data.skills || [];
}

/**
 * Load a JSON file safely
 */
function loadJsonFile(filePath: string, defaultValue: any): any {
  if (!existsSync(filePath)) {
    return defaultValue;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`[DataLoader] Error loading ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Default NPCs for when data files aren't available
 */
function getDefaultNPCs(): NPCTemplate[] {
  return [
    {
      id: 'goblin',
      name: 'Goblin',
      level: 2,
      health: 50,
      attackStyle: 'melee',
      aggressive: false,
      respawnTime: 30,
      stats: { attack: 3, defense: 2, speed: 1.2 },
      drops: [
        { itemId: 'gold_coins', quantity: [5, 15], chance: 1.0 },
        { itemId: 'bronze_sword', quantity: 1, chance: 0.05 },
      ],
    },
    {
      id: 'giant_spider',
      name: 'Giant Spider',
      level: 8,
      health: 120,
      attackStyle: 'melee',
      aggressive: true,
      respawnTime: 45,
      stats: { attack: 8, defense: 4, speed: 1.5 },
      abilities: ['poison_bite'],
      drops: [
        { itemId: 'gold_coins', quantity: [20, 50], chance: 1.0 },
        { itemId: 'spider_silk', quantity: [1, 3], chance: 0.8 },
      ],
    },
    {
      id: 'bandit',
      name: 'Bandit',
      level: 15,
      health: 200,
      attackStyle: 'melee',
      aggressive: true,
      respawnTime: 60,
      stats: { attack: 15, defense: 10, speed: 1.0 },
      drops: [
        { itemId: 'gold_coins', quantity: [50, 150], chance: 1.0 },
        { itemId: 'iron_sword', quantity: 1, chance: 0.1 },
      ],
    },
  ];
}

/**
 * Default resources for when data files aren't available
 */
function getDefaultResources(): ResourceTemplate[] {
  return [
    // Mining
    {
      id: 'copper_rock',
      name: 'Copper Rock',
      type: 'ore',
      skillRequired: 'mining',
      levelRequired: 1,
      xpGained: 10,
      harvestTime: 3000,
      respawnTime: 30,
      yields: [{ itemId: 'copper_ore', quantity: 1, chance: 1.0 }],
    },
    {
      id: 'iron_rock',
      name: 'Iron Rock',
      type: 'ore',
      skillRequired: 'mining',
      levelRequired: 15,
      xpGained: 25,
      harvestTime: 4000,
      respawnTime: 60,
      yields: [{ itemId: 'iron_ore', quantity: 1, chance: 1.0 }],
    },
    // Woodcutting
    {
      id: 'oak_tree',
      name: 'Oak Tree',
      type: 'tree',
      skillRequired: 'woodcutting',
      levelRequired: 1,
      xpGained: 8,
      harvestTime: 2500,
      respawnTime: 25,
      yields: [{ itemId: 'oak_log', quantity: 1, chance: 1.0 }],
    },
    {
      id: 'maple_tree',
      name: 'Maple Tree',
      type: 'tree',
      skillRequired: 'woodcutting',
      levelRequired: 35,
      xpGained: 45,
      harvestTime: 5000,
      respawnTime: 90,
      yields: [{ itemId: 'maple_log', quantity: 1, chance: 1.0 }],
    },
    // Fishing
    {
      id: 'fishing_spot_sardine',
      name: 'Fishing Spot',
      type: 'fish',
      skillRequired: 'fishing',
      levelRequired: 1,
      xpGained: 10,
      harvestTime: 4000,
      respawnTime: 10,
      yields: [
        { itemId: 'raw_sardine', quantity: 1, chance: 0.7 },
        { itemId: 'raw_shrimp', quantity: 1, chance: 0.3 },
      ],
    },
    {
      id: 'fishing_spot_trout',
      name: 'River Fishing Spot',
      type: 'fish',
      skillRequired: 'fishing',
      levelRequired: 20,
      xpGained: 30,
      harvestTime: 5000,
      respawnTime: 15,
      yields: [
        { itemId: 'raw_trout', quantity: 1, chance: 0.6 },
        { itemId: 'raw_salmon', quantity: 1, chance: 0.4 },
      ],
    },
  ];
}
