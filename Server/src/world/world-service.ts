/**
 * World Service
 *
 * Coordinates all world systems (NPCs, resources, zones, events).
 */

import { npcManager, NPCTemplate, NPCInstance } from './npc-manager.js';
import { resourceManager, ResourceTemplate, ResourceNode } from './resource-manager.js';

export interface Zone {
  id: number;
  name: string;
  minLevel: number;
  maxLevel: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  safeZone: boolean;
  pvpEnabled: boolean;
}

export interface WorldEvent {
  id: string;
  name: string;
  zoneId: number;
  startTime: Date;
  endTime: Date;
  active: boolean;
}

export class WorldService {
  private zones: Map<number, Zone> = new Map();
  private activeEvents: Map<string, WorldEvent> = new Map();
  private lastTick: number = Date.now();

  constructor() {
    this.initializeZones();
  }

  /**
   * Initialize world zones
   */
  private initializeZones(): void {
    const zoneData: Zone[] = [
      {
        id: 1,
        name: 'Sunhaven Valley',
        minLevel: 1,
        maxLevel: 20,
        bounds: { minX: 0, maxX: 10000, minY: 0, maxY: 10000, minZ: -500, maxZ: 500 },
        safeZone: true,
        pvpEnabled: false,
      },
      {
        id: 2,
        name: 'Ironwood Forest',
        minLevel: 15,
        maxLevel: 40,
        bounds: { minX: 10000, maxX: 25000, minY: 0, maxY: 15000, minZ: -500, maxZ: 1000 },
        safeZone: false,
        pvpEnabled: false,
      },
      {
        id: 3,
        name: 'Dustfall Desert',
        minLevel: 30,
        maxLevel: 60,
        bounds: { minX: 25000, maxX: 45000, minY: 0, maxY: 20000, minZ: -200, maxZ: 300 },
        safeZone: false,
        pvpEnabled: false,
      },
      {
        id: 4,
        name: 'Frostpeak Mountains',
        minLevel: 50,
        maxLevel: 80,
        bounds: { minX: 0, maxX: 20000, minY: 15000, maxY: 35000, minZ: 0, maxZ: 5000 },
        safeZone: false,
        pvpEnabled: false,
      },
      {
        id: 5,
        name: 'Shadowmire Swamp',
        minLevel: 45,
        maxLevel: 70,
        bounds: { minX: 20000, maxX: 40000, minY: 15000, maxY: 30000, minZ: -300, maxZ: 100 },
        safeZone: false,
        pvpEnabled: false,
      },
      {
        id: 6,
        name: 'Crimson Coast',
        minLevel: 40,
        maxLevel: 75,
        bounds: { minX: 45000, maxX: 65000, minY: 0, maxY: 25000, minZ: -100, maxZ: 200 },
        safeZone: false,
        pvpEnabled: false,
      },
      {
        id: 7,
        name: 'The Verdant Highlands',
        minLevel: 60,
        maxLevel: 90,
        bounds: { minX: 25000, maxX: 45000, minY: 25000, maxY: 45000, minZ: 1000, maxZ: 3000 },
        safeZone: false,
        pvpEnabled: false,
      },
      {
        id: 8,
        name: 'The Abyss',
        minLevel: 80,
        maxLevel: 120,
        bounds: { minX: 0, maxX: 30000, minY: 0, maxY: 30000, minZ: -5000, maxZ: -1000 },
        safeZone: false,
        pvpEnabled: true,
      },
    ];

    for (const zone of zoneData) {
      this.zones.set(zone.id, zone);
    }

    console.log(`[WorldService] Initialized ${this.zones.size} zones`);
  }

  /**
   * Initialize world content (NPCs, resources)
   */
  async initialize(
    npcTemplates: NPCTemplate[],
    resourceTemplates: ResourceTemplate[]
  ): Promise<void> {
    // Load templates
    npcManager.loadTemplates(npcTemplates);
    resourceManager.loadTemplates(resourceTemplates);

    // Spawn initial NPCs in each zone
    await this.spawnZoneContent();

    // Load persisted states
    await resourceManager.loadPersistedStates();

    console.log('[WorldService] World initialized');
  }

  /**
   * Spawn NPCs and resources in all zones
   */
  private async spawnZoneContent(): Promise<void> {
    // Sunhaven Valley (starter zone) spawns
    const starterSpawns = [
      { templateId: 'goblin', count: 15, zoneId: 1 },
      { templateId: 'giant_spider', count: 8, zoneId: 1 },
    ];

    for (const spawn of starterSpawns) {
      const zone = this.zones.get(spawn.zoneId);
      if (!zone) continue;

      for (let i = 0; i < spawn.count; i++) {
        const position = {
          x: zone.bounds.minX + Math.random() * (zone.bounds.maxX - zone.bounds.minX),
          y: zone.bounds.minY + Math.random() * (zone.bounds.maxY - zone.bounds.minY),
          z: 0,
        };

        npcManager.spawnNPC(spawn.templateId, position, spawn.zoneId);
      }
    }

    // Spawn resource nodes
    const resourceSpawns = [
      { templateId: 'copper_rock', count: 20, zoneId: 1 },
      { templateId: 'oak_tree', count: 25, zoneId: 1 },
      { templateId: 'fishing_spot_sardine', count: 10, zoneId: 1 },
    ];

    for (const spawn of resourceSpawns) {
      const zone = this.zones.get(spawn.zoneId);
      if (!zone) continue;

      for (let i = 0; i < spawn.count; i++) {
        const position = {
          x: zone.bounds.minX + Math.random() * (zone.bounds.maxX - zone.bounds.minX),
          y: zone.bounds.minY + Math.random() * (zone.bounds.maxY - zone.bounds.minY),
          z: 0,
        };

        resourceManager.spawnNode(spawn.templateId, position, spawn.zoneId);
      }
    }

    console.log(
      `[WorldService] Spawned ${npcManager.totalCount} NPCs and resources`
    );
  }

  /**
   * Main update loop
   */
  update(): void {
    const now = Date.now();
    const deltaTime = now - this.lastTick;
    this.lastTick = now;

    // Update NPCs
    npcManager.update(deltaTime);

    // Update resources
    resourceManager.update(now);

    // Update events
    this.updateEvents(now);
  }

  /**
   * Update world events
   */
  private updateEvents(now: number): void {
    for (const event of this.activeEvents.values()) {
      if (event.active && event.endTime.getTime() < now) {
        event.active = false;
        console.log(`[WorldService] Event ended: ${event.name}`);
      }
    }
  }

  /**
   * Get zone by ID
   */
  getZone(zoneId: number): Zone | undefined {
    return this.zones.get(zoneId);
  }

  /**
   * Get zone for position
   */
  getZoneForPosition(x: number, y: number, z: number): Zone | undefined {
    for (const zone of this.zones.values()) {
      const b = zone.bounds;
      if (
        x >= b.minX &&
        x <= b.maxX &&
        y >= b.minY &&
        y <= b.maxY &&
        z >= b.minZ &&
        z <= b.maxZ
      ) {
        return zone;
      }
    }
    return undefined;
  }

  /**
   * Get all zones
   */
  getAllZones(): Zone[] {
    return Array.from(this.zones.values());
  }

  /**
   * Check if position is in safe zone
   */
  isInSafeZone(zoneId: number): boolean {
    const zone = this.zones.get(zoneId);
    return zone?.safeZone ?? false;
  }

  /**
   * Check if PvP is enabled in zone
   */
  isPvPEnabled(zoneId: number): boolean {
    const zone = this.zones.get(zoneId);
    return zone?.pvpEnabled ?? false;
  }

  /**
   * Get NPCs in zone
   */
  getNPCsInZone(zoneId: number): NPCInstance[] {
    return npcManager.getNPCsInZone(zoneId);
  }

  /**
   * Get resources in zone
   */
  getResourcesInZone(zoneId: number): ResourceNode[] {
    return resourceManager.getNodesInZone(zoneId);
  }

  /**
   * Start a world event
   */
  startEvent(
    name: string,
    zoneId: number,
    durationMinutes: number
  ): WorldEvent {
    const event: WorldEvent = {
      id: `event-${Date.now()}`,
      name,
      zoneId,
      startTime: new Date(),
      endTime: new Date(Date.now() + durationMinutes * 60 * 1000),
      active: true,
    };

    this.activeEvents.set(event.id, event);
    console.log(`[WorldService] Event started: ${name} in zone ${zoneId}`);

    return event;
  }

  /**
   * Get active events
   */
  getActiveEvents(): WorldEvent[] {
    return Array.from(this.activeEvents.values()).filter((e) => e.active);
  }
}

export const worldService = new WorldService();
