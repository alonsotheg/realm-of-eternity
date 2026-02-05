/**
 * NPC Manager
 *
 * Manages NPCs, their spawning, AI state, and interactions.
 */

import { v4 as uuidv4 } from 'uuid';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface NPCTemplate {
  id: string;
  name: string;
  level: number;
  health: number;
  attackStyle: 'melee' | 'ranged' | 'magic';
  aggressive: boolean;
  respawnTime: number; // seconds
  stats: {
    attack: number;
    defense: number;
    speed: number;
  };
  abilities?: string[];
  drops: NPCDrop[];
}

export interface NPCDrop {
  itemId: string;
  quantity: number | [number, number]; // Fixed or range
  chance: number; // 0-1
}

export interface NPCInstance {
  id: string;
  templateId: string;
  name: string;
  position: Vector3;
  spawnPosition: Vector3;
  rotation: number;
  zoneId: number;
  health: number;
  maxHealth: number;
  level: number;
  state: NPCState;
  targetId?: string; // Player currently being attacked
  lastAttackTime: number;
  lastMoveTime: number;
  respawnAt?: number;
}

export enum NPCState {
  IDLE = 'idle',
  WANDERING = 'wandering',
  CHASING = 'chasing',
  ATTACKING = 'attacking',
  RETURNING = 'returning',
  DEAD = 'dead',
}

export class NPCManager {
  private templates: Map<string, NPCTemplate> = new Map();
  private instances: Map<string, NPCInstance> = new Map();
  private instancesByZone: Map<number, Set<string>> = new Map();
  private respawnQueue: Array<{ instanceId: string; respawnAt: number }> = [];

  /**
   * Load NPC templates from data
   */
  loadTemplates(templates: NPCTemplate[]): void {
    for (const template of templates) {
      this.templates.set(template.id, template);
    }
    console.log(`[NPCManager] Loaded ${templates.length} NPC templates`);
  }

  /**
   * Spawn an NPC in the world
   */
  spawnNPC(
    templateId: string,
    position: Vector3,
    zoneId: number
  ): NPCInstance | null {
    const template = this.templates.get(templateId);
    if (!template) {
      console.error(`[NPCManager] Template not found: ${templateId}`);
      return null;
    }

    const instance: NPCInstance = {
      id: uuidv4(),
      templateId,
      name: template.name,
      position: { ...position },
      spawnPosition: { ...position },
      rotation: Math.random() * 360,
      zoneId,
      health: template.health,
      maxHealth: template.health,
      level: template.level,
      state: NPCState.IDLE,
      lastAttackTime: 0,
      lastMoveTime: Date.now(),
    };

    this.instances.set(instance.id, instance);

    // Add to zone index
    if (!this.instancesByZone.has(zoneId)) {
      this.instancesByZone.set(zoneId, new Set());
    }
    this.instancesByZone.get(zoneId)!.add(instance.id);

    return instance;
  }

  /**
   * Get NPC by ID
   */
  getNPC(instanceId: string): NPCInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get all NPCs in a zone
   */
  getNPCsInZone(zoneId: number): NPCInstance[] {
    const npcIds = this.instancesByZone.get(zoneId);
    if (!npcIds) return [];

    return Array.from(npcIds)
      .map((id) => this.instances.get(id))
      .filter((npc): npc is NPCInstance => npc !== undefined);
  }

  /**
   * Get NPCs near a position
   */
  getNPCsNearPosition(
    zoneId: number,
    position: Vector3,
    radius: number
  ): NPCInstance[] {
    const npcs = this.getNPCsInZone(zoneId);
    return npcs.filter((npc) => {
      const dist = this.distance(npc.position, position);
      return dist <= radius && npc.state !== NPCState.DEAD;
    });
  }

  /**
   * Damage an NPC
   */
  damageNPC(
    instanceId: string,
    damage: number,
    attackerId: string
  ): { died: boolean; drops?: NPCDrop[] } {
    const npc = this.instances.get(instanceId);
    if (!npc || npc.state === NPCState.DEAD) {
      return { died: false };
    }

    npc.health = Math.max(0, npc.health - damage);

    // Set target if aggressive
    const template = this.templates.get(npc.templateId);
    if (template?.aggressive && !npc.targetId) {
      npc.targetId = attackerId;
      npc.state = NPCState.CHASING;
    }

    if (npc.health <= 0) {
      return this.killNPC(instanceId);
    }

    return { died: false };
  }

  /**
   * Kill an NPC and schedule respawn
   */
  private killNPC(instanceId: string): { died: boolean; drops: NPCDrop[] } {
    const npc = this.instances.get(instanceId);
    if (!npc) return { died: false, drops: [] };

    const template = this.templates.get(npc.templateId);
    if (!template) return { died: false, drops: [] };

    npc.state = NPCState.DEAD;
    npc.targetId = undefined;

    // Calculate drops
    const drops = this.rollDrops(template.drops);

    // Schedule respawn
    const respawnAt = Date.now() + template.respawnTime * 1000;
    npc.respawnAt = respawnAt;
    this.respawnQueue.push({ instanceId, respawnAt });

    console.log(
      `[NPCManager] ${npc.name} killed, respawning in ${template.respawnTime}s`
    );

    return { died: true, drops };
  }

  /**
   * Roll for drops
   */
  private rollDrops(dropTable: NPCDrop[]): NPCDrop[] {
    const drops: NPCDrop[] = [];

    for (const drop of dropTable) {
      if (Math.random() <= drop.chance) {
        const quantity = Array.isArray(drop.quantity)
          ? Math.floor(
              Math.random() * (drop.quantity[1] - drop.quantity[0] + 1) +
                drop.quantity[0]
            )
          : drop.quantity;

        drops.push({
          itemId: drop.itemId,
          quantity,
          chance: drop.chance,
        });
      }
    }

    return drops;
  }

  /**
   * Update all NPCs (called each tick)
   */
  update(deltaTime: number): void {
    const now = Date.now();

    // Process respawns
    this.processRespawns(now);

    // Update each NPC
    for (const npc of this.instances.values()) {
      if (npc.state === NPCState.DEAD) continue;
      this.updateNPC(npc, deltaTime, now);
    }
  }

  /**
   * Process NPC respawns
   */
  private processRespawns(now: number): void {
    while (
      this.respawnQueue.length > 0 &&
      this.respawnQueue[0].respawnAt <= now
    ) {
      const respawn = this.respawnQueue.shift()!;
      const npc = this.instances.get(respawn.instanceId);

      if (npc) {
        // Reset NPC
        const template = this.templates.get(npc.templateId);
        if (template) {
          npc.health = template.health;
          npc.position = { ...npc.spawnPosition };
          npc.state = NPCState.IDLE;
          npc.targetId = undefined;
          npc.respawnAt = undefined;

          console.log(`[NPCManager] ${npc.name} respawned`);
        }
      }
    }
  }

  /**
   * Update a single NPC
   */
  private updateNPC(npc: NPCInstance, deltaTime: number, now: number): void {
    const template = this.templates.get(npc.templateId);
    if (!template) return;

    switch (npc.state) {
      case NPCState.IDLE:
        // Random chance to start wandering
        if (Math.random() < 0.01) {
          npc.state = NPCState.WANDERING;
        }
        break;

      case NPCState.WANDERING:
        // Move randomly within spawn area
        if (now - npc.lastMoveTime > 2000) {
          const angle = Math.random() * Math.PI * 2;
          const distance = Math.random() * 50;
          const newPos = {
            x: npc.spawnPosition.x + Math.cos(angle) * distance,
            y: npc.spawnPosition.y + Math.sin(angle) * distance,
            z: npc.spawnPosition.z,
          };

          // Don't wander too far
          if (this.distance(newPos, npc.spawnPosition) <= 100) {
            npc.position = newPos;
          }

          npc.lastMoveTime = now;

          // Chance to return to idle
          if (Math.random() < 0.3) {
            npc.state = NPCState.IDLE;
          }
        }
        break;

      case NPCState.CHASING:
        // TODO: Get player position and chase
        // If player too far, return to spawn
        if (this.distance(npc.position, npc.spawnPosition) > 200) {
          npc.state = NPCState.RETURNING;
          npc.targetId = undefined;
        }
        break;

      case NPCState.ATTACKING:
        // Attack cooldown based on speed
        const attackCooldown = 1000 / template.stats.speed;
        if (now - npc.lastAttackTime > attackCooldown) {
          // TODO: Deal damage to target
          npc.lastAttackTime = now;
        }
        break;

      case NPCState.RETURNING:
        // Move back to spawn
        const toSpawn = {
          x: npc.spawnPosition.x - npc.position.x,
          y: npc.spawnPosition.y - npc.position.y,
          z: 0,
        };
        const dist = this.distance(npc.position, npc.spawnPosition);

        if (dist > 5) {
          const moveSpeed = template.stats.speed * 2;
          npc.position.x += (toSpawn.x / dist) * moveSpeed;
          npc.position.y += (toSpawn.y / dist) * moveSpeed;
        } else {
          npc.position = { ...npc.spawnPosition };
          npc.state = NPCState.IDLE;
          npc.health = template.health; // Heal when returning
        }
        break;
    }
  }

  /**
   * Calculate distance between two positions
   */
  private distance(a: Vector3, b: Vector3): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)
    );
  }

  /**
   * Get NPC template
   */
  getTemplate(templateId: string): NPCTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get total NPC count
   */
  get totalCount(): number {
    return this.instances.size;
  }

  /**
   * Get alive NPC count
   */
  get aliveCount(): number {
    let count = 0;
    for (const npc of this.instances.values()) {
      if (npc.state !== NPCState.DEAD) count++;
    }
    return count;
  }
}

export const npcManager = new NPCManager();
