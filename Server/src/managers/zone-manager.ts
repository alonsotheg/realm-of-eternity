/**
 * Zone Manager
 *
 * Manages world zones, NPCs, and environment state.
 */

import { Zone, NPC, Vector3 } from '../types/index.js';

export class ZoneManager {
  private zones: Map<number, Zone> = new Map();
  private npcs: Map<string, NPC> = new Map();
  private npcsByZone: Map<number, Set<string>> = new Map();

  constructor() {
    this.initializeZones();
  }

  private initializeZones(): void {
    // Define initial zones
    const zoneDefinitions: Omit<Zone, 'players'>[] = [
      {
        id: 1,
        name: 'Sunhaven Valley',
        minLevel: 1,
        maxLevel: 20,
        bounds: { minX: 0, maxX: 10000, minY: 0, maxY: 10000, minZ: -500, maxZ: 500 },
      },
      {
        id: 2,
        name: 'Ironwood Forest',
        minLevel: 15,
        maxLevel: 40,
        bounds: { minX: 10000, maxX: 25000, minY: 0, maxY: 15000, minZ: -500, maxZ: 1000 },
      },
      {
        id: 3,
        name: 'Dustfall Desert',
        minLevel: 30,
        maxLevel: 60,
        bounds: { minX: 25000, maxX: 45000, minY: 0, maxY: 20000, minZ: -200, maxZ: 300 },
      },
      {
        id: 4,
        name: 'Frostpeak Mountains',
        minLevel: 50,
        maxLevel: 80,
        bounds: { minX: 0, maxX: 20000, minY: 15000, maxY: 35000, minZ: 0, maxZ: 5000 },
      },
      {
        id: 5,
        name: 'Shadowmire Swamp',
        minLevel: 45,
        maxLevel: 70,
        bounds: { minX: 20000, maxX: 40000, minY: 15000, maxY: 30000, minZ: -300, maxZ: 100 },
      },
    ];

    for (const zoneDef of zoneDefinitions) {
      this.zones.set(zoneDef.id, {
        ...zoneDef,
        players: new Set(),
      });
      this.npcsByZone.set(zoneDef.id, new Set());
    }

    console.log(`[ZoneManager] Initialized ${this.zones.size} zones`);
  }

  getZone(zoneId: number): Zone | undefined {
    return this.zones.get(zoneId);
  }

  getAllZones(): Zone[] {
    return Array.from(this.zones.values());
  }

  getZoneForPosition(position: Vector3): Zone | undefined {
    for (const zone of this.zones.values()) {
      if (this.isPositionInZone(position, zone)) {
        return zone;
      }
    }
    return undefined;
  }

  private isPositionInZone(position: Vector3, zone: Zone): boolean {
    const { bounds } = zone;
    return (
      position.x >= bounds.minX &&
      position.x <= bounds.maxX &&
      position.y >= bounds.minY &&
      position.y <= bounds.maxY &&
      position.z >= bounds.minZ &&
      position.z <= bounds.maxZ
    );
  }

  addPlayerToZone(playerId: string, zoneId: number): void {
    const zone = this.zones.get(zoneId);
    if (zone) {
      zone.players.add(playerId);
    }
  }

  removePlayerFromZone(playerId: string, zoneId: number): void {
    const zone = this.zones.get(zoneId);
    if (zone) {
      zone.players.delete(playerId);
    }
  }

  spawnNPC(npc: NPC, zoneId: number): void {
    this.npcs.set(npc.id, npc);
    this.npcsByZone.get(zoneId)?.add(npc.id);
  }

  despawnNPC(npcId: string): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      for (const zoneNpcs of this.npcsByZone.values()) {
        zoneNpcs.delete(npcId);
      }
      this.npcs.delete(npcId);
    }
  }

  getNPCsInZone(zoneId: number): NPC[] {
    const npcIds = this.npcsByZone.get(zoneId);
    if (!npcIds) return [];

    return Array.from(npcIds)
      .map((id) => this.npcs.get(id))
      .filter((npc): npc is NPC => npc !== undefined);
  }

  update(deltaTime: number): void {
    // Update NPC AI, respawns, etc.
    for (const npc of this.npcs.values()) {
      // TODO: Process NPC behavior
    }
  }
}
